// Camada de LLM no servidor (rotas TanStack). Ordem: chave da conta (Anthropic ou OpenAI, no Vault)
// e, sem ela, o Lovable AI Gateway. Toda chamada vai para llm_calls e para a carteira de consumo.
import { admin } from "@/backend/http.server";
import { assertAiBudget } from "@/backend/ai/budget.server";
import type { AiBudgetSettings } from "@/backend/ai/budget";
import { maskText } from "@/lib/mask-sensitive";

import {
  EMBEDDING_DIMS,
  GATEWAY_EMBEDDING_MODEL,
  GATEWAY_FALLBACK_MODEL,
  GATEWAY_URL,
  OPENAI_EMBEDDING_MODEL,
  gatewayChatUrl,
  gatewayHeaders,
  gatewayModel,
  isGatewayClaude,
  shouldFallback,
  type AiTier,
  type GatewayModelSettings,
} from "./ai/models";
import {
  DEFAULT_MODEL,
  anthropicBody,
  chatBody,
  estimateCost,
  parseAnthropic,
  parseChat,
  type JsonRequest,
  type ParsedJson,
  type ProviderId,
} from "./llm-core";

export type { LlmMessage } from "./llm-core";

interface Choice {
  provider: ProviderId;
  model: string;
  key: string;
}

const TIMEOUT_MS = 30_000;

async function secret(accountId: string, key: string): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: key,
  });
  return typeof data === "string" && data ? data : null;
}

export interface CallOptions {
  /** Modelo por provedor (ex.: o avaliador de qualidade usa um modelo barato configurável). */
  modelFor?: Partial<Record<"anthropic" | "openai", string>> | undefined;
  /** Tarefa: escolhe o modelo da IA embutida (reply/deep = Opus 5.5, fast/voice = Haiku 4.5). */
  tier?: AiTier | undefined;
}

/** Erro HTTP da IA, com o status para decidir o recuo. */
export class AiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// CPF, cartão e senha nunca vão para a IA: a entrada é mascarada aqui, num lugar só.
export function maskRequest(r: JsonRequest): JsonRequest {
  return {
    ...r,
    system: maskText(r.system),
    messages: r.messages.map((m) => ({ ...m, content: maskText(m.content) })),
  };
}

export async function chooseProvider(accountId: string, opts: CallOptions = {}): Promise<Choice> {
  const { data: account } = await admin()
    .from("accounts")
    .select("settings")
    .eq("id", accountId)
    .single();
  const settings = (account?.settings ?? {}) as {
    ai?: { provider?: string; model?: string } & GatewayModelSettings;
    setup?: { ai_mode?: string };
  } & AiBudgetSettings;
  // R9: teto mensal por conta. Acima dele só a IA para (lança AiBudgetExceeded).
  await assertAiBudget(accountId, settings);
  const ai = settings.ai ?? {};
  const mode = settings.setup?.ai_mode;
  const gatewayKey = process.env["LOVABLE_API_KEY"];
  const included = (): Choice => ({
    provider: "lovable",
    model: gatewayModel(opts.tier ?? "fast", ai),
    key: gatewayKey!,
  });
  // "IA inclusa" escolhida no assistente: usa o gateway mesmo que exista uma chave antiga no cofre
  if (mode === "included" && gatewayKey) return included();
  const preferred = mode === "openai" || mode === "anthropic" ? mode : ai.provider;
  const order: ("anthropic" | "openai")[] =
    preferred === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
  for (const p of order) {
    const key = await secret(accountId, `${p}_api_key`);
    if (key)
      return {
        provider: p,
        model: opts.modelFor?.[p] || (ai.provider === p && ai.model) || DEFAULT_MODEL[p],
        key,
      };
  }
  if (gatewayKey) return included();
  throw new Error(
    "Nenhum provedor de IA configurado: cadastre a chave da Anthropic ou da OpenAI em Ajustes › Inteligência",
  );
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (res.status === 429) throw new Error("limite de uso da IA atingido, tente em instantes");
  if (res.status === 402) throw new Error("créditos de IA esgotados");
  if (!res.ok)
    throw new AiHttpError(`IA ${res.status}: ${json.error?.message ?? "erro"}`, res.status);
  return json;
}

/** Corpo e leitura de uma chamada JSON, conforme o provedor e o modelo escolhidos. */
async function jsonOnce<T>(choice: Choice, r: JsonRequest): Promise<ParsedJson<T>> {
  if (choice.provider === "anthropic")
    return parseAnthropic<T>(
      await post(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": choice.key, "anthropic-version": "2023-06-01" },
        anthropicBody(choice.model, r),
      ),
    );
  if (choice.provider === "lovable" && isGatewayClaude(choice.model))
    return parseAnthropic<T>(
      await post(
        gatewayChatUrl(choice.model),
        { ...gatewayHeaders(choice.key), "anthropic-version": "2023-06-01" },
        anthropicBody(choice.model, r),
      ),
    );
  const url =
    choice.provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : gatewayChatUrl(choice.model);
  return parseChat<T>(
    await post(
      url,
      { authorization: `Bearer ${choice.key}` },
      chatBody(choice.provider, choice.model, r),
    ),
  );
}

/** O Claude do gateway falhou por motivo do modelo (não da conta): vale recuar para o reserva. */
export function gatewayFallback(choice: Choice, err: unknown): Choice | null {
  if (choice.provider !== "lovable" || choice.model === GATEWAY_FALLBACK_MODEL) return null;
  if (err instanceof AiHttpError && !shouldFallback(err.status)) return null;
  if (err instanceof Error && /créditos|limite de uso/.test(err.message)) return null;
  return { ...choice, model: GATEWAY_FALLBACK_MODEL };
}

export async function callJson<T>(
  accountId: string,
  purpose: string,
  raw: JsonRequest,
  opts: CallOptions = {},
): Promise<{ data: T; model: string; costUsd: number }> {
  const r = maskRequest(raw);
  const first = await chooseProvider(accountId, opts);
  const attempt = async (choice: Choice) => {
    const started = Date.now();
    try {
      const parsed = await jsonOnce<T>(choice, r);
      await log(
        accountId,
        purpose,
        choice,
        started,
        parsed.inputTokens,
        parsed.outputTokens,
        true,
        null,
      );
      return {
        data: parsed.data,
        model: choice.model,
        costUsd: estimateCost(choice.model, parsed.inputTokens, parsed.outputTokens),
      };
    } catch (err) {
      await log(accountId, purpose, choice, started, null, null, false, String(err));
      throw err;
    }
  };
  try {
    return await attempt(first);
  } catch (err) {
    const next = gatewayFallback(first, err);
    if (!next) throw err;
    return attempt(next);
  }
}

async function log(
  accountId: string,
  purpose: string,
  c: Choice,
  started: number,
  input: number | null,
  output: number | null,
  ok: boolean,
  error: string | null,
) {
  const db = admin();
  await db.from("llm_calls").insert({
    account_id: accountId,
    purpose,
    provider: c.provider,
    model: c.model,
    input_tokens: input,
    output_tokens: output,
    latency_ms: Date.now() - started,
    ok,
    error: error ? maskText(error).slice(0, 500) : null,
  });
  if (ok) {
    await db.from("usage_ledger").insert({
      account_id: accountId,
      kind: "llm",
      quantity: (input ?? 0) + (output ?? 0),
      unit: "tokens",
      cost_usd: estimateCost(c.model, input, output),
      meta: { purpose, model: c.model },
    });
  }
}

export interface Embedding {
  vector: number[];
  model: string;
}

/**
 * Embedding da base (RAG). Padrão da plataforma: Gemini Embedding 2 no gateway do Lovable,
 * reduzido a 1536 dimensões (a coluna). Sem o gateway, a chave da OpenAI da conta. Aceita lote.
 * Vetor de modelos diferentes não se compara: quem grava guarda o modelo junto.
 */
export async function embedMany(accountId: string, texts: string[]): Promise<Embedding[] | null> {
  const input = texts.map((t) => t.slice(0, 24_000)).filter((t) => t.trim());
  if (!input.length || input.length !== texts.length) return null;
  // R9: embedding também gasta IA; acima do teto a busca cai para texto (quem chama trata null)
  const { data: acc } = await admin()
    .from("accounts")
    .select("settings")
    .eq("id", accountId)
    .single();
  try {
    await assertAiBudget(accountId, (acc?.settings ?? {}) as AiBudgetSettings);
  } catch {
    return null;
  }
  const gw = process.env["LOVABLE_API_KEY"];
  const key = gw ?? (await secret(accountId, "openai_api_key"));
  if (!key) return null;
  const model = gw ? GATEWAY_EMBEDDING_MODEL : OPENAI_EMBEDDING_MODEL;
  const url = gw ? `${GATEWAY_URL}/embeddings` : "https://api.openai.com/v1/embeddings";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(gw ? gatewayHeaders(key) : { authorization: `Bearer ${key}` }),
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, input, dimensions: EMBEDDING_DIMS }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => ({}))) as {
    data?: { embedding: number[]; index?: number }[];
    usage?: { total_tokens?: number; prompt_tokens?: number };
  };
  const rows = [...(j.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== input.length || rows.some((r) => r.embedding?.length !== EMBEDDING_DIMS))
    return null;
  const tokens = j.usage?.total_tokens ?? j.usage?.prompt_tokens ?? 0;
  await admin()
    .from("usage_ledger")
    .insert({
      account_id: accountId,
      kind: "llm",
      quantity: tokens,
      unit: "tokens",
      cost_usd: estimateCost(model, tokens, 0),
      meta: { purpose: "embedding", model },
    });
  return rows.map((r) => ({ vector: r.embedding, model }));
}

/** Um texto só (a pergunta do cliente): o vetor, ou null sem provedor. */
export async function embed(accountId: string, text: string): Promise<number[] | null> {
  return (await embedOne(accountId, text))?.vector ?? null;
}

export async function embedOne(accountId: string, text: string): Promise<Embedding | null> {
  if (!text.trim()) return null;
  return (await embedMany(accountId, [text]))?.[0] ?? null;
}

export function vectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
