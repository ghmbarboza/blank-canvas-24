import type { Trigger } from "./engine";

export const EVENT_LABEL: Record<string, string> = {
  "contact.created": "Contato criado",
  "contact.became_hot": "Contato esquentou",
  "contact.lifecycle_changed": "Contato mudou de fase",
  "deal.created": "Negócio criado",
  "deal.stage_changed": "Negócio mudou de etapa",
  "deal.won": "Negócio ganho",
  "deal.lost": "Negócio perdido",
  "message.received": "Mensagem recebida",
  "form.submitted": "Formulário enviado",
  "meeting.scheduled": "Reunião marcada",
  "meeting.ended": "Reunião encerrada",
  "meeting.no_show": "Não compareceu à reunião",
  "meeting.confirmed": "Confirmou presença na reunião",
  "meeting.canceled": "Cancelou a reunião",
  "meeting.rescheduled": "Remarcou a reunião",
  "call.ended": "Ligação encerrada",
  "email.opened": "Abriu e-mail",
  "email.clicked": "Clicou no e-mail",
  "ticket.created": "Chamado aberto",
  "ticket.resolved": "Chamado resolvido",
  "proposal.viewed": "Abriu a proposta",
  "proposal.accepted": "Aceitou a proposta",
  "payment.confirmed": "Pagamento confirmado",
};

export function triggerSummary(t: Trigger): string {
  switch (t.type) {
    case "event":
      return `Quando: ${EVENT_LABEL[t.event ?? ""] ?? t.event ?? "evento"}`;
    case "segment":
      return "Quando entra num segmento";
    case "no_reply":
      return `Sem resposta há ${t.hours ?? 24} h`;
    case "date":
      return `${t.days_before ?? 0} dia(s) antes de ${t.field?.replace(/^custom\./, "") ?? "uma data"}`;
    default:
      return "Inscrição manual";
  }
}
