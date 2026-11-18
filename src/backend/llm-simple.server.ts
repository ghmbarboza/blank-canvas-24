// Atalho para a camada única de LLM (llm.server.ts) com a assinatura de objeto usada pela voz e
// pela telefonia. Mesmo provedor, mesmo recuo, mesmo registro em llm_calls e na carteira.
import type { AiTier } from "./ai/models";
import { callJson as callJsonCore } from "./llm.server";

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
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** Padrão "fast" (resumo de ligação, coach, extração). */
  tier?: AiTier;
}

export class LlmUnavailable extends Error {}

export async function callJson<T>(o: JsonCallOptions): Promise<{ data: T; model: string }> {
  try {
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
      { tier: o.tier ?? "fast" },
    );
    return { data: r.data, model: r.model };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Nenhum provedor de IA"))
      throw new LlmUnavailable(err.message);
    throw err;
  }
}
