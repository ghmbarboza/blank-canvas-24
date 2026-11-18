import type { Channel, Conversation } from "../types";

type AiFields = Pick<Conversation, "ai_enabled" | "ai_handoff_at" | "status" | "is_group">;

// A IA responde quando o canal e a conversa estão com IA ligada e ninguém da equipe assumiu.
// Mesma regra do orquestrador (backend/agents/orchestrator.server.ts).
export function isAiActive(
  conversation: AiFields,
  channel: Pick<Channel, "ai_enabled"> | undefined,
): boolean {
  if (conversation.is_group || conversation.status === "closed") return false;
  return Boolean(channel?.ai_enabled) && conversation.ai_enabled && !conversation.ai_handoff_at;
}
