import { formatRelative } from "@/lib/format";
import { slaState } from "@/features/support/constants";

// "O que precisa de você hoje": pendências reais do pós-venda, cada uma com motivo e uma ação.
// Ordem por urgência: prazo estourado, cliente esperando, passagem da IA, prazo perto, cliente em risco.
export type AttentionKind =
  "ticket_late" | "waiting" | "handoff" | "ticket_due" | "complaint" | "client_risk";

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
  waiting: 1,
  handoff: 2,
  ticket_due: 3,
  complaint: 4,
  client_risk: 5,
};

export const ATTENTION_ACTION: Record<AttentionKind, string> = {
  ticket_late: "Abrir chamado",
  waiting: "Responder agora",
  handoff: "Assumir conversa",
  ticket_due: "Abrir chamado",
  complaint: "Ver cliente",
  client_risk: "Ver cliente",
};

export const ATTENTION_MAX = 5;
/** Quantos clientes em risco entram na lista (os de pior saúde). */
export const RISK_MAX = 2;

export interface WaitingRow {
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
/** Cliente em risco pela saúde da carteira (features/gestao/health.ts). */
export interface RiskRow {
  contact_id: string;
  name: string;
  score: number;
  /** Sinal que mais pesou na nota. */
  reason: string | null;
  next_action: string;
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

/** Reclamação aberta no Reclame Aqui, registrada à mão na ficha do cliente. */
export interface ComplaintRow {
  contact_id: string;
  name: string;
  /** Dia do registro, "AAAA-MM-DD". */
  at: string;
}
/** Quantas reclamações abertas entram na lista (as mais antigas). */
export const COMPLAINT_MAX = 2;

export interface AttentionSources {
  waiting: WaitingRow[];
  handoffs: HandoffRow[];
  risk: RiskRow[];
  tickets: TicketRow[];
  complaints?: ComplaintRow[];
}

export function buildAttention(src: AttentionSources, now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const c of src.waiting) {
    const since = c.last_inbound_at ? `, escreveu ${formatRelative(c.last_inbound_at)}` : "";
    items.push({
      key: `waiting-${c.id}`,
      kind: "waiting",
      title: `Cliente esperando resposta: ${c.name}`,
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
  // Reclamação pública aberta: a mais antiga primeiro. Quem já entrou aqui não repete como "em risco".
  const complained = new Set<string>();
  for (const c of [...(src.complaints ?? [])]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, COMPLAINT_MAX)) {
    complained.add(c.contact_id);
    items.push({
      key: `complaint-${c.contact_id}`,
      kind: "complaint",
      title: `Reclamação aberta no Reclame Aqui: ${c.name}`,
      reason: `Registrada em ${c.at.split("-").reverse().join("/")}. Responda no Reclame Aqui e fale com o cliente; depois atualize a situação na ficha.`,
      ref: c.contact_id,
      at: c.at,
    });
  }
  // Pior saúde primeiro: a nota entra na âncora para ordenar dentro do tipo.
  for (const r of [...src.risk]
    .filter((x) => !complained.has(x.contact_id))
    .sort((a, b) => a.score - b.score)
    .slice(0, RISK_MAX)) {
    items.push({
      key: `risk-${r.contact_id}`,
      kind: "client_risk",
      title: `Cliente em risco: ${r.name}`,
      reason: `Saúde ${r.score} de 100${r.reason ? `. ${r.reason}` : ""}. ${r.next_action}.`,
      ref: r.contact_id,
      at: String(r.score).padStart(3, "0"),
    });
  }
  return items
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.at.localeCompare(b.at))
    .slice(0, ATTENTION_MAX);
}
