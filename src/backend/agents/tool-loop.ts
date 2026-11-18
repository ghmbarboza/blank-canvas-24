// Chamada de ferramentas (tool calling) sem rede: monta o corpo para Anthropic e para o formato
// de chat da OpenAI (também usado pelo gateway do Lovable) e lê as chamadas que o modelo pediu.
import { supportsForcedTool } from "@/backend/llm-core";
import type { JsonSchema } from "@/features/agents/catalog";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface Attachment {
  kind: "image" | "pdf";
  url: string;
  name?: string | undefined;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  content: string;
  isError: boolean;
}

export type Turn =
  | { role: "user"; content: string; attachments?: Attachment[] | undefined }
  | { role: "assistant"; content: string }
  | {
      role: "assistant_tools";
      text: string;
      calls: ToolCall[];
      /** Blocos crus do Claude (raciocínio + tool_use): voltam intactos na rodada seguinte. */
      raw?: unknown[] | undefined;
    }
  | { role: "tool_results"; results: ToolResult[] };

export interface ParsedTools {
  text: string;
  calls: ToolCall[];
  /** Conteúdo cru da resposta do Claude (só no formato Anthropic). */
  raw?: unknown[] | undefined;
  inputTokens: number | null;
  outputTokens: number | null;
}

const DROP_KEYS = new Set(["examples", "title", "file_uploadable", "default", "$schema", "format"]);
const MAX_DESC = 400;

/** Esquema de terceiro (Composio) enxuto e aceito pelos dois provedores. */
export function sanitizeSchema(schema: unknown, depth = 0): JsonSchema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || depth > 6)
    return depth === 0 ? { type: "object", properties: {} } : {};
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (DROP_KEYS.has(k)) continue;
    if (k === "description" && typeof v === "string") out[k] = v.slice(0, MAX_DESC);
    else if (k === "properties" && v && typeof v === "object")
      out[k] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [
          pk,
          sanitizeSchema(pv, depth + 1),
        ]),
      );
    else if ((k === "items" || k === "additionalProperties") && v && typeof v === "object")
      out[k] = sanitizeSchema(v, depth + 1);
    else if ((k === "anyOf" || k === "oneOf" || k === "allOf") && Array.isArray(v))
      out[k] = v.map((x) => sanitizeSchema(x, depth + 1));
    else out[k] = v;
  }
  if (depth === 0) {
    out["type"] = "object";
    if (!out["properties"]) out["properties"] = {};
  }
  return out;
}

export function toolName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

// ───────────────────────── Anthropic ─────────────────────────
type AnthropicBlock = Record<string, unknown>;

function anthropicUserBlocks(t: Extract<Turn, { role: "user" }>): AnthropicBlock[] {
  const blocks: AnthropicBlock[] = [];
  for (const a of t.attachments ?? []) {
    if (a.kind === "image") blocks.push({ type: "image", source: { type: "url", url: a.url } });
    else blocks.push({ type: "document", source: { type: "url", url: a.url } });
  }
  blocks.push({ type: "text", text: t.content || "(sem texto)" });
  return blocks;
}

export function anthropicMessages(turns: Turn[]) {
  const msgs: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];
  const push = (role: "user" | "assistant", blocks: AnthropicBlock[]) => {
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else msgs.push({ role, content: [...blocks] });
  };
  for (const t of turns) {
    if (t.role === "user") push("user", anthropicUserBlocks(t));
    else if (t.role === "assistant") push("assistant", [{ type: "text", text: t.content || "…" }]);
    else if (t.role === "assistant_tools" && t.raw?.length)
      // Opus 5.5: o raciocínio não desliga e o bloco dele precisa voltar como veio
      push("assistant", t.raw as AnthropicBlock[]);
    else if (t.role === "assistant_tools")
      push("assistant", [
        ...(t.text ? [{ type: "text", text: t.text }] : []),
        ...t.calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args })),
      ]);
    else
      push(
        "user",
        t.results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      );
  }
  if (msgs[0]?.role !== "user")
    msgs.unshift({ role: "user", content: [{ type: "text", text: "(início da conversa)" }] });
  return msgs;
}

export function anthropicToolsBody(
  model: string,
  system: string,
  turns: Turn[],
  tools: ToolSpec[],
  maxTokens = 1500,
) {
  // Opus 5.5 recusa ferramenta forçada (400) e pensa sempre: escolha livre, esforço baixo
  // (resposta de atendimento), teto maior para o raciocínio não cortar a resposta
  const forced = supportsForcedTool(model);
  return {
    model,
    max_tokens: forced ? maxTokens : Math.max(4000, maxTokens),
    ...(forced ? {} : { output_config: { effort: "low" } }),
    system,
    messages: anthropicMessages(turns),
    tools: tools.map((t) => ({
      name: toolName(t.name),
      description: t.description.slice(0, 1000),
      input_schema: t.parameters,
    })),
    tool_choice: { type: forced ? "any" : "auto" },
  };
}

export function parseAnthropicTools(body: unknown): ParsedTools {
  const b = body as {
    content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (b.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  const calls = (b.content ?? [])
    .filter((c) => c.type === "tool_use" && c.name)
    .map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.name!,
      args: (c.input && typeof c.input === "object" ? c.input : {}) as Record<string, unknown>,
    }));
  return {
    text,
    calls,
    raw: calls.length ? (b.content ?? []) : undefined,
    inputTokens: b.usage?.input_tokens ?? null,
    outputTokens: b.usage?.output_tokens ?? null,
  };
}

// ───────────────────────── chat da OpenAI / gateway ─────────────────────────
export function chatMessages(system: string, turns: Turn[]) {
  const out: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const t of turns) {
    if (t.role === "user") {
      const images = (t.attachments ?? []).filter((a) => a.kind === "image");
      const pdfs = (t.attachments ?? []).filter((a) => a.kind === "pdf");
      const text = [
        t.content || "(sem texto)",
        ...pdfs.map((p) => `[o cliente anexou um PDF${p.name ? `: ${p.name}` : ""}]`),
      ].join("\n");
      out.push(
        images.length
          ? {
              role: "user",
              content: [
                { type: "text", text },
                ...images.map((i) => ({ type: "image_url", image_url: { url: i.url } })),
              ],
            }
          : { role: "user", content: text },
      );
    } else if (t.role === "assistant") out.push({ role: "assistant", content: t.content });
    else if (t.role === "assistant_tools")
      out.push({
        role: "assistant",
        content: t.text || null,
        tool_calls: t.calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      });
    else
      for (const r of t.results) out.push({ role: "tool", tool_call_id: r.id, content: r.content });
  }
  return out;
}

export function chatToolsBody(
  provider: "openai" | "lovable",
  model: string,
  system: string,
  turns: Turn[],
  tools: ToolSpec[],
  maxTokens = 1500,
) {
  return {
    model,
    messages: chatMessages(system, turns),
    tools: tools.map((t) => ({
      type: "function",
      function: {
        name: toolName(t.name),
        description: t.description.slice(0, 1000),
        parameters: t.parameters,
      },
    })),
    tool_choice: "required",
    // Atendimento é resposta curta com a base na mão: sem isto o Gemini gastava até 11 s
    // "pensando" antes de responder (medido em 18/11). Só no gateway com modelo do Google.
    ...(provider === "lovable" && model.startsWith("google/") ? { reasoning_effort: "low" } : {}),
    ...(provider === "openai" ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
  };
}

export function parseChatTools(body: unknown): ParsedTools {
  const b = body as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[];
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const m = b.choices?.[0]?.message;
  const calls: ToolCall[] = [];
  for (const [i, c] of (m?.tool_calls ?? []).entries()) {
    if (!c.function?.name) continue;
    let args: Record<string, unknown> = {};
    const raw = c.function.arguments;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw || "{}") as unknown;
        if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
      } catch {
        args = { _invalid_json: raw.slice(0, 500) };
      }
    } else if (raw && typeof raw === "object") args = raw as Record<string, unknown>;
    calls.push({ id: c.id ?? `call_${i}`, name: c.function.name, args });
  }
  return {
    text: (m?.content ?? "").trim(),
    calls,
    inputTokens: b.usage?.prompt_tokens ?? null,
    outputTokens: b.usage?.completion_tokens ?? null,
  };
}

/** Resultado de ferramenta como texto curto para o modelo (nunca estoura o contexto). */
export function resultText(value: unknown, max = 4000): string {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return s.length > max ? `${s.slice(0, max)}… (cortado)` : s;
}
