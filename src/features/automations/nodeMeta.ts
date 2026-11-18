import {
  Bell,
  Bot,
  Boxes,
  CircleStop,
  Clock,
  GitBranch,
  Hourglass,
  KanbanSquare,
  LifeBuoy,
  ListTodo,
  Mail,
  MessageCircle,
  MessageSquareText,
  PenLine,
  PhoneCall,
  Shuffle,
  Tag,
  Tags,
  UserPlus,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import { NODE_LABEL, formatMinutes, type AutoNode, type NodeType } from "./engine";

export const NODE_ICON: Record<NodeType, LucideIcon> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquareText,
  voice_call: PhoneCall,
  task: ListTodo,
  ticket: LifeBuoy,
  move_stage: KanbanSquare,
  assign: UserPlus,
  add_tag: Tag,
  remove_tag: Tags,
  set_field: PenLine,
  ai_toggle: Bot,
  wait: Clock,
  wait_event: Hourglass,
  condition: GitBranch,
  ab_split: Shuffle,
  webhook: Webhook,
  notify: Bell,
  ai_agent: Bot,
  composio_action: Boxes,
  end: CircleStop,
};

export const PALETTE: { group: string; types: NodeType[] }[] = [
  { group: "Falar com o contato", types: ["whatsapp", "email", "sms", "voice_call"] },
  { group: "Trabalho da equipe", types: ["task", "ticket", "notify", "assign"] },
  { group: "Equipe de IA e apps", types: ["ai_agent", "composio_action"] },
  { group: "CRM", types: ["move_stage", "add_tag", "remove_tag", "set_field", "ai_toggle"] },
  { group: "Tempo e decisão", types: ["wait", "wait_event", "condition", "ab_split"] },
  { group: "Outros", types: ["webhook", "end"] },
];

export const BRANCH_TYPES: NodeType[] = ["condition", "wait_event", "ab_split"];

export const BRANCH_LABEL: Record<string, { yes: string; no: string }> = {
  condition: { yes: "Sim", no: "Não" },
  wait_event: { yes: "Aconteceu", no: "Prazo acabou" },
  ab_split: { yes: "Grupo A", no: "Grupo B" },
};

const COND_LABEL: Record<string, string> = {
  opened: "abriu o e-mail",
  clicked: "clicou no e-mail",
  replied: "respondeu",
  meeting: "marcou reunião",
  score_gte: "score ≥",
  lifecycle_eq: "fase é",
  temperature_eq: "temperatura é",
  has_tag: "tem a etiqueta",
  field_eq: "campo é",
};

export function nodeSummary(n: AutoNode): string {
  const c = n.config ?? {};
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  switch (n.type) {
    case "email":
      return s("subject") || "Sem assunto";
    case "whatsapp":
      return s("template_name")
        ? `Template ${s("template_name")}`
        : s("text").slice(0, 70) || "Sem texto";
    case "sms":
      return s("text").slice(0, 70) || "Sem texto";
    case "voice_call":
      return s("goal") || "Agente de voz";
    case "task":
      return s("title") || "Sem título";
    case "ticket":
      return s("subject") || "Sem assunto";
    case "wait":
      return formatMinutes(Number(c["minutes"] ?? 60));
    case "wait_event":
      return `${COND_LABEL[s("event")] ?? "evento"} em até ${formatMinutes(Number(c["timeout_minutes"] ?? 1440))}`;
    case "condition":
      return `Se ${COND_LABEL[s("kind")] ?? "?"} ${c["value"] ?? ""}`.trim();
    case "ab_split":
      return `${Number(c["percent_a"] ?? 50)}% / ${100 - Number(c["percent_a"] ?? 50)}%`;
    case "add_tag":
    case "remove_tag":
      return s("tag") || "Sem etiqueta";
    case "set_field":
      return s("field") ? `${s("field")} = ${String(c["value"] ?? "")}` : "Sem campo";
    case "ai_toggle":
      return c["enabled"] ? "Ligar a IA" : "Desligar a IA";
    case "webhook":
      return s("url") || "Sem URL";
    case "notify":
      return s("title") || "Sem aviso";
    case "ai_agent":
      return s("agent_name")
        ? `${s("agent_name")}${s("goal") ? `: ${s("goal").slice(0, 50)}` : ""}`
        : "Escolha o agente";
    case "composio_action":
      return s("tool_label") || s("tool_slug") || "Escolha a ação";
    case "assign":
      return `${Array.isArray(c["users"]) ? (c["users"] as unknown[]).length : 0} pessoa(s) em rodízio`;
    case "move_stage":
      return s("stage_name") || "Escolha a etapa";
    default:
      return NODE_LABEL[n.type];
  }
}
