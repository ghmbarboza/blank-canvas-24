// Parte pura da camada de LLM (sem rede): monta os corpos de requisição e lê as respostas.
// Testável no vitest; o llm.server.ts faz as chamadas.
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ProviderId = "anthropic" | "openai" | "lovable";

export interface JsonRequest {
  system: string;
  messages: LlmMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number | undefined;
}

export const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: "claude-haiku-5-5",
  openai: "gpt-5.4-mini",
  lovable: "google/gemini-3.8-flash",
};

/** Claude que recusa ferramenta forçada (400): Opus 5.5, Sonnet 5.5, Fable 5.1. */
export function supportsForcedTool(model: string): boolean {
  const m = model.replace(/^anthropic\//, "");
  return !/^claude-(opus-5-5|sonnet-5-5|fable-5-1|mythos-5-1)/.test(m);
}

/** JSON Schema fechado (additionalProperties: false em todo objeto), como pede a saída estruturada. */
export function strictSchema(schema: unknown, depth = 0): unknown {
  if (depth > 12 || !schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map((s) => strictSchema(s, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>))
    out[k] =
      k === "properties" && v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [
              pk,
              strictSchema(pv, depth + 1),
            ]),
          )
        : strictSchema(v, depth + 1);
  if (out["type"] === "object" && out["additionalProperties"] === undefined)
    out["additionalProperties"] = false;
  return out;
}

export function anthropicBody(model: string, r: JsonRequest) {
  const base = {
    model,
    max_tokens: r.maxTokens ?? 1200,
    system: r.system,
    messages: r.messages.filter((m) => m.role !== "system"),
  };
  if (!supportsForcedTool(model))
    // Opus 5.5: sem ferramenta forçada e sem desligar o raciocínio; o JSON vem pela saída
    // estruturada e o esforço baixo segura latência e custo
    return {
      ...base,
      max_tokens: Math.max(4000, r.maxTokens ?? 1200),
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: strictSchema(r.schema) },
      },
    };
  return {
    ...base,
    tools: [{ name: r.schemaName, description: "Resultado estruturado", input_schema: r.schema }],
    tool_choice: { type: "tool", name: r.schemaName },
  };
}

export function chatBody(provider: "openai" | "lovable", model: string, r: JsonRequest) {
  return {
    model,
    messages: [
      { role: "system", content: r.system },
      ...r.messages.filter((m) => m.role !== "system"),
    ],
    tools: [
      {
        type: "function",
        function: {
          name: r.schemaName,
          description: "Resultado estruturado",
          parameters: r.schema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: r.schemaName } },
    ...(provider === "openai"
      ? { max_completion_tokens: r.maxTokens ?? 1200 }
      : { max_tokens: r.maxTokens ?? 1500 }),
  };
}

export interface ParsedJson<T> {
  data: T;
  inputTokens: number | null;
  outputTokens: number | null;
}

export function parseAnthropic<T>(body: unknown): ParsedJson<T> {
  const b = body as {
    content?: { type: string; input?: unknown; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const usage = {
    inputTokens: b.usage?.input_tokens ?? null,
    outputTokens: b.usage?.output_tokens ?? null,
  };
  const block = (b.content ?? []).find((c) => c.type === "tool_use");
  if (block) return { data: block.input as T, ...usage };
  // saída estruturada (output_config.format): o JSON vem no texto
  const text = (b.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  if (!text) throw new Error("anthropic sem tool_use nem JSON");
  return { data: JSON.parse(text) as T, ...usage };
}

export function parseChat<T>(body: unknown): ParsedJson<T> {
  const b = body as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: unknown } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const args = b.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (args === undefined || args === null) throw new Error("modelo não devolveu o JSON pedido");
  const data = (typeof args === "string" ? JSON.parse(args) : args) as T;
  return {
    data,
    inputTokens: b.usage?.prompt_tokens ?? null,
    outputTokens: b.usage?.completion_tokens ?? null,
  };
}

// Custo aproximado em US$ por milhão de tokens (entrada, saída), só para a carteira de consumo.
const PRICE: Record<string, [number, number]> = {
  "claude-haiku-5-5": [1, 5],
  "gpt-5.4-mini": [0.25, 2],
  "google/gemini-2.5-flash": [0.3, 2.5],
  "google/gemini-3.8-flash": [0.75, 3.75],
  "anthropic/claude-opus-5-5": [4, 20],
  "anthropic/claude-haiku-4-5": [1, 5],
  "anthropic/claude-sonnet-5": [2, 10],
  "google/gemini-embedding-2": [0.2, 0],
  "text-embedding-3-small": [0.02, 0],
};

export function estimateCost(model: string, input: number | null, output: number | null): number {
  const [i, o] = PRICE[model] ?? [1, 4];
  return ((input ?? 0) * i + (output ?? 0) * o) / 1_000_000;
}
