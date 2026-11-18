// Camada única de LLM. Ordem: chave própria da conta (Anthropic ou OpenAI, no Vault) e,
// sem ela, o Lovable AI Gateway do projeto. Toda chamada é registrada em llm_calls.
import { adminClient } from "./supabase.ts";
import { getSecret } from "./secrets.ts";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface JsonCallOptions {
  accountId: string;
  purpose: string;
  system: string;
  messages: LlmMessage[];
  schemaName: string;
  schema: Record<string, unknown>; // JSON Schema do objeto de saída
  maxTokens?: number;
}

interface ProviderChoice {
  provider: "anthropic" | "openai" | "lovable";
  model: string;
  key: string;
}

const TIMEOUT_MS = 30_000;

async function chooseProvider(accountId: string): Promise<ProviderChoice> {
  const db = adminClient();
  const { data: account } = await db
    .from("accounts")
    .select("settings")
    .eq("id", accountId)
    .single();
  const ai = (account?.settings as { ai?: { provider?: string; model?: string } } | null)?.ai ?? {};
  if (ai.provider === "anthropic") {
    const key = await getSecret("integration", accountId, "anthropic_api_key");
    if (key) return { provider: "anthropic", model: ai.model || "claude-haiku-5-5", key };
  }
  if (ai.provider === "openai") {
    const key = await getSecret("integration", accountId, "openai_api_key");
    if (key) return { provider: "openai", model: ai.model || "gpt-5.4-mini", key };
  }
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("Nenhum provedor de IA configurado (LOVABLE_API_KEY ausente)");
  // gemini-2.5-flash foi descontinuado no gateway (04/11/2026): o Flash atual
  return { provider: "lovable", model: "google/gemini-3.8-flash", key };
}

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Chama o modelo forçando uma ferramenta cujo argumento é o JSON pedido.
export async function callJson<T>(opts: JsonCallOptions): Promise<{ data: T; model: string }> {
  const choice = await chooseProvider(opts.accountId);
  const started = Date.now();
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  try {
    let parsed: T;
    if (choice.provider === "anthropic") {
      const res = await withTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": choice.key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: choice.model,
          max_tokens: opts.maxTokens ?? 1200,
          system: opts.system,
          messages: opts.messages.filter((m) => m.role !== "system"),
          tools: [
            {
              name: opts.schemaName,
              description: "Resultado estruturado",
              input_schema: opts.schema,
            },
          ],
          tool_choice: { type: "tool", name: opts.schemaName },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${body?.error?.message ?? "erro"}`);
      inputTokens = body.usage?.input_tokens ?? null;
      outputTokens = body.usage?.output_tokens ?? null;
      const block = (body.content ?? []).find((c: { type: string }) => c.type === "tool_use");
      if (!block) throw new Error("anthropic sem tool_use");
      parsed = block.input as T;
    } else {
      const url =
        choice.provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://ai.gateway.lovable.dev/v1/chat/completions";
      const res = await withTimeout(url, {
        method: "POST",
        headers: { authorization: `Bearer ${choice.key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: choice.model,
          messages: [{ role: "system", content: opts.system }, ...opts.messages],
          tools: [
            {
              type: "function",
              function: {
                name: opts.schemaName,
                description: "Resultado estruturado",
                parameters: opts.schema,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: opts.schemaName } },
          ...(choice.provider === "openai"
            ? { max_completion_tokens: opts.maxTokens ?? 1200 }
            : { max_tokens: opts.maxTokens ?? 1500 }),
        }),
      });
      const body = await res.json();
      if (res.status === 429) throw new Error("limite de uso da IA atingido, tente em instantes");
      if (res.status === 402) throw new Error("créditos de IA esgotados no workspace");
      if (!res.ok)
        throw new Error(`${choice.provider} ${res.status}: ${body?.error?.message ?? "erro"}`);
      inputTokens = body.usage?.prompt_tokens ?? null;
      outputTokens = body.usage?.completion_tokens ?? null;
      const args = body.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("modelo não devolveu o JSON pedido");
      parsed = (typeof args === "string" ? JSON.parse(args) : args) as T;
    }
    await logCall(opts, choice, started, inputTokens, outputTokens, true, null);
    return { data: parsed, model: choice.model };
  } catch (err) {
    await logCall(opts, choice, started, inputTokens, outputTokens, false, String(err));
    throw err;
  }
}

async function logCall(
  opts: JsonCallOptions,
  choice: ProviderChoice,
  started: number,
  input: number | null,
  output: number | null,
  ok: boolean,
  error: string | null,
) {
  await adminClient()
    .from("llm_calls")
    .insert({
      account_id: opts.accountId,
      purpose: opts.purpose,
      provider: choice.provider,
      model: choice.model,
      input_tokens: input,
      output_tokens: output,
      latency_ms: Date.now() - started,
      ok,
      error: error?.slice(0, 500),
    });
}
