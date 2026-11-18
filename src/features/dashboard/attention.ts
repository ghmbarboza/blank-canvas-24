import { formatMoney, formatRelative } from "@/lib/format";
import { slaState } from "@/features/support/constants";

// "O que precisa de você": pendências reais, cada uma com motivo e uma ação. Ordem por urgência.
export type AttentionKind =
  "ticket_late" | "hot_waiting" | "handoff" | "ticket_due" | "deal_stalled";

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  title: string;
  reason: string;
  ref: string;
  /** Instante que ancora a urgência (mais antigo = mais urgente dentro do mesmo tipo). */
  at: string;
}

const RANK: Record<AttentionKind, number> = {
  ticket_late: 0,
  hot_waiting: 1,
  handoff: 2,
  ticket_due: 3,
  deal_stalled: 4,
};

export const ATTENTION_ACTION: Record<AttentionKind, string> = {
  ticket_late: "Abrir chamado",
  hot_waiting: "Responder agora",
  handoff: "Assumir conversa",
  ticket_due: "Abrir chamado",
  deal_stalled: "Retomar negócio",
};

export const STALLED_DAYS = 7;
export const ATTENTION_MAX = 5;

export interface HotWaitingRow {
  id: string;
  name: string;
  unread: number;
  last_inbound_at: string | null;
}
export interface HandoffRow {
  id: string;
  name: string;
  reason: string | null;
  at: string;
}
export interface StalledDealRow {
  id: string;
  title: string;
  value: number;
  contact: string | null;
  updated_at: string;
}
export interface TicketRow {
  id: string;
  number: number;
  subject: string;
  status: string;
  created_at: string;
  first_response_at: string | null;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
}

export interface AttentionSources {
  hot: HotWaitingRow[];
  handoffs: HandoffRow[];
  deals: StalledDealRow[];
  tickets: TicketRow[];
}

export function buildAttention(src: AttentionSources, now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const c of src.hot) {
    const since = c.last_inbound_at ? `, escreveu ${formatRelative(c.last_inbound_at)}` : "";
    items.push({
      key: `hot-${c.id}`,
      kind: "hot_waiting",
      title: `Lead quente sem resposta: ${c.name}`,
      reason: `${c.unread} ${c.unread === 1 ? "mensagem não lida" : "mensagens não lidas"}${since}.`,
      ref: c.id,
      at: c.last_inbound_at ?? new Date(now).toISOString(),
    });
  }
  for (const h of src.handoffs) {
    items.push({
      key: `handoff-${h.id}`,
      kind: "handoff",
      title: `A IA passou ${h.name} para a equipe`,
      reason: `${h.reason ? `${h.reason}. ` : ""}Ninguém assumiu ainda, desde ${formatRelative(h.at)}.`,
      ref: h.id,
      at: h.at,
    });
  }
  for (const t of src.tickets) {
    const sla = slaState(t, now);
    if (sla.tone !== "late" && sla.tone !== "warn") continue;
    items.push({
      key: `ticket-${t.id}`,
      kind: sla.tone === "late" ? "ticket_late" : "ticket_due",
      title: `Chamado #${t.number}: ${t.subject}`,
      reason: sla.tone === "late" ? `Prazo estourado: ${sla.label}.` : `Vence logo: ${sla.label}.`,
      ref: t.id,
      at: new Date(now + (sla.minutesLeft ?? 0) * 60_000).toISOString(),
    });
  }
  for (const d of src.deals) {
    items.push({
      key: `deal-${d.id}`,
      kind: "deal_stalled",
      title: `Negócio parado: ${d.title}`,
      reason: `${formatMoney(d.value)}${d.contact ? ` com ${d.contact}` : ""}, sem movimento desde ${formatRelative(d.updated_at)}.`,
      ref: d.id,
      at: d.updated_at,
    });
  }
  return items
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.at.localeCompare(b.at))
    .slice(0, ATTENTION_MAX);
}
