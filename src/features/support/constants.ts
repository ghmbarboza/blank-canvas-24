export type TicketStatus = "open" | "pending" | "waiting_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aberto",
  pending: "Em andamento",
  waiting_customer: "Aguardando cliente",
  resolved: "Resolvido",
  closed: "Fechado",
};
export const STATUS_ORDER: TicketStatus[] = [
  "open",
  "pending",
  "waiting_customer",
  "resolved",
  "closed",
];
export const OPEN_STATUSES: TicketStatus[] = ["open", "pending", "waiting_customer"];

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: "Urgente",
  high: "Alta",
  normal: "Normal",
  low: "Baixa",
};
export const PRIORITY_ORDER: TicketPriority[] = ["urgent", "high", "normal", "low"];

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Aberto pela equipe",
  conversation: "Conversa",
  email: "E-mail",
  webchat: "Chat do site",
  voice: "Ligação (IA de voz)",
  api: "API",
  whatsapp: "WhatsApp",
  form: "Formulário",
};

export interface SlaState {
  label: string;
  tone: "ok" | "warn" | "late" | "done";
  minutesLeft: number | null;
}

// Situação do SLA de um chamado: quanto falta (ou quanto passou) do prazo que vence primeiro.
export function slaState(
  t: {
    status: string;
    first_response_at: string | null;
    first_response_due_at: string | null;
    resolution_due_at: string | null;
    created_at: string;
  },
  now = Date.now(),
): SlaState {
  if (!OPEN_STATUSES.includes(t.status as TicketStatus))
    return { label: "Concluído", tone: "done", minutesLeft: null };
  const due =
    !t.first_response_at && t.first_response_due_at ? t.first_response_due_at : t.resolution_due_at;
  if (!due) return { label: "Sem prazo", tone: "ok", minutesLeft: null };
  const left = Math.round((new Date(due).getTime() - now) / 60_000);
  const what = !t.first_response_at && t.first_response_due_at ? "1ª resposta" : "solução";
  const fmt = (m: number) =>
    Math.abs(m) >= 60 * 24
      ? `${Math.round(Math.abs(m) / 1440)} d`
      : Math.abs(m) >= 60
        ? `${Math.round(Math.abs(m) / 60)} h`
        : `${Math.abs(m)} min`;
  if (left < 0) return { label: `${what} atrasada ${fmt(left)}`, tone: "late", minutesLeft: left };
  const total = (new Date(due).getTime() - new Date(t.created_at).getTime()) / 60_000;
  const tone = left <= Math.max(30, total * 0.2) ? "warn" : "ok";
  return { label: `${what} em ${fmt(left)}`, tone, minutesLeft: left };
}

// Horas (sac_metrics devolve a média em horas) em "2 h 15 min", "40 min" ou "1,5 d".
export function formatResolution(hours: number | null): string {
  if (hours === null) return "—";
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${minutes} min`;
  if (minutes >= 60 * 48) return `${(minutes / 1440).toFixed(1).replace(".", ",")} d`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
