// IA das reuniões (ata, briefing, coach ao vivo) pela camada única de LLM (llm.server.ts).
// "fast" = modelo pequeno (coach ao vivo); "smart" = ata e análise (Opus 5.5 na IA embutida).
import { callJson as callJsonCore } from "./llm.server";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface JsonCallOptions {
  accountId: string;
  purpose: string;
  system: string;
  messages: LlmMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  tier?: "fast" | "smart";
}

export async function callJson<T>(o: JsonCallOptions): Promise<{ data: T; model: string }> {
  const smart = o.tier !== "fast";
  const r = await callJsonCore<T>(
    o.accountId,
    o.purpose,
    {
      system: o.system,
      messages: o.messages,
      schemaName: o.schemaName,
      schema: o.schema,
      maxTokens: o.maxTokens,
    },
    {
      tier: smart ? "deep" : "fast",
      ...(smart ? { modelFor: { anthropic: "claude-sonnet-5-5", openai: "gpt-5.4" } } : {}),
    },
  );
  return { data: r.data, model: r.model };
}
