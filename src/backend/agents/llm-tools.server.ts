// Chamada com ferramentas no provedor da conta (chave da empresa; recuo no gateway do Lovable).
// Cada chamada vai para llm_calls e para a carteira de consumo, como em llm.server.ts.
import { admin } from "@/backend/http.server";
import { gatewayChatUrl, gatewayHeaders, isGatewayClaude, type AiTier } from "@/backend/ai/models";
import { estimateCost } from "@/backend/llm-core";
import { AiHttpError, chooseProvider, gatewayFallback } from "@/backend/llm.server";

import {
  anthropicToolsBody,
  chatToolsBody,
  parseAnthropicTools,
  parseChatTools,
  type ParsedTools,
  type ToolSpec,
  type Turn,
} from "./tool-loop";

const TIMEOUT_MS = 45_000;

export interface ToolsRequest {
  system: string;
  turns: Turn[];
  tools: ToolSpec[];
  maxTokens?: number;
  /** Padrão "reply": o agente falando com o cliente (Opus 5.5 na IA embutida). */
  tier?: AiTier;
}

export interface ToolsResponse extends ParsedTools {
  model: string;
  provider: string;
  costUsd: number;
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

export async function providerModel(
  accountId: string,
): Promise<{ provider: string; model: string }> {
  const c = await chooseProvider(accountId, { tier: "reply" });
  return { provider: c.provider, model: c.model };
}

type Choice = Awaited<ReturnType<typeof chooseProvider>>;

async function toolsOnce(choice: Choice, r: ToolsRequest): Promise<ParsedTools> {
  const anthropicFormat =
    choice.provider === "anthropic" ||
    (choice.provider === "lovable" && isGatewayClaude(choice.model));
  if (anthropicFormat) {
    const url =
      choice.provider === "anthropic"
        ? "https://api.anthropic.com/v1/messages"
        : gatewayChatUrl(choice.model);
    const headers =
      choice.provider === "anthropic" ? { "x-api-key": choice.key } : gatewayHeaders(choice.key);
    return parseAnthropicTools(
      await post(
        url,
        { ...headers, "anthropic-version": "2023-06-01" },
        anthropicToolsBody(choice.model, r.system, r.turns, r.tools, r.maxTokens),
      ),
    );
  }
  const url =
    choice.provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : gatewayChatUrl(choice.model);
  // o formato chat não lê os blocos crus do Claude: a rodada segue pelo texto e pelas chamadas
  const turns = r.turns.map((t) => (t.role === "assistant_tools" ? { ...t, raw: undefined } : t));
  return parseChatTools(
    await post(
      url,
      { authorization: `Bearer ${choice.key}` },
      chatToolsBody(
        choice.provider === "openai" ? "openai" : "lovable",
        choice.model,
        r.system,
        turns,
        r.tools,
        r.maxTokens,
      ),
    ),
  );
}

async function record(
  accountId: string,
  purpose: string,
  choice: Choice,
  started: number,
  parsed: ParsedTools | null,
  error: string | null,
) {
  const db = admin();
  const input = parsed?.inputTokens ?? null;
  const output = parsed?.outputTokens ?? null;
  await db.from("llm_calls").insert({
    account_id: accountId,
    purpose,
    provider: choice.provider,
    model: choice.model,
    input_tokens: input,
    output_tokens: output,
    latency_ms: Date.now() - started,
    ok: !error,
    error: error?.slice(0, 500) ?? null,
  });
  if (!error)
    await db.from("usage_ledger").insert({
      account_id: accountId,
      kind: "llm",
      quantity: (input ?? 0) + (output ?? 0),
      unit: "tokens",
      cost_usd: estimateCost(choice.model, input, output),
      meta: { purpose, model: choice.model },
    });
}

export async function callTools(
  accountId: string,
  purpose: string,
  r: ToolsRequest,
): Promise<ToolsResponse> {
  const first = await chooseProvider(accountId, { tier: r.tier ?? "reply" });
  const attempt = async (choice: Choice): Promise<ToolsResponse> => {
    const started = Date.now();
    try {
      const parsed = await toolsOnce(choice, r);
      await record(accountId, purpose, choice, started, parsed, null);
      return {
        ...parsed,
        model: choice.model,
        provider: choice.provider,
        costUsd: estimateCost(choice.model, parsed.inputTokens, parsed.outputTokens),
      };
    } catch (err) {
      await record(
        accountId,
        purpose,
        choice,
        started,
        null,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  };
  try {
    return await attempt(first);
  } catch (err) {
    // Claude do gateway fora: o Gemini atual responde, e o registro mostra que houve recuo
    const next = gatewayFallback(first, err);
    if (!next) throw err;
    return attempt(next);
  }
}
