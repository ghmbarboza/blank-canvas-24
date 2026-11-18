// Mesma persona em todos os canais (P3): o agente de voz da ElevenLabs ligado a um agente da equipe
// recebe o mesmo prompt-base (quem é, objetivo, regras, política) e as ferramentas equivalentes.
import { agentSettingsV2, roleDef, type AgentRole } from "./catalog";

/** Ferramenta da equipe → ferramenta do agente de voz (agent-tool-*). */
export const TEAM_TO_VOICE_TOOL: Record<string, string> = {
  identify_contact: "crm_lookup",
  availability: "slots",
  book: "book",
  reschedule: "slots",
  open_ticket: "create_ticket",
  create_deal: "update_deal",
  score_lead: "update_deal",
};

export interface TeamAgentForVoice {
  name: string;
  role: string;
  persona: string;
  tone: string;
  goal: string;
  instructions: string;
  settings: unknown;
}

export function voicePersona(
  team: TeamAgentForVoice,
  teamTools: string[],
  voiceTools: string[],
): { promptPrefix: string; tools: string[] } {
  const s = agentSettingsV2(team.settings);
  const promptPrefix = [
    `Você é ${team.persona || team.name}, ${roleDef(team.role as AgentRole).label.toLowerCase()} da empresa {{company_name}}. É a mesma pessoa que atende no WhatsApp e no chat.`,
    team.goal ? `Objetivo: ${team.goal}` : "",
    `Tom: ${team.tone}.`,
    team.instructions ? `Regras da empresa:\n${team.instructions}` : "",
    s.policy ? `Política (não passe disso):\n${s.policy}` : "",
    "Nunca invente preço, prazo ou desconto. Se o cliente pedir uma pessoa, passe para a equipe com resumo.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const mapped = teamTools.map((t) => TEAM_TO_VOICE_TOOL[t]).filter((t): t is string => !!t);
  const tools = [...new Set([...voiceTools, ...mapped, "route_to_queue"])];
  return { promptPrefix, tools };
}
