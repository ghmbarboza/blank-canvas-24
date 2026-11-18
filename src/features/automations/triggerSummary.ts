import { EDITION, hasChannel, type Edition } from "@/lib/edition";
import type { Trigger } from "./engine";

export const EVENT_LABEL: Record<string, string> = {
  "contact.created": "Contato criado",
  "contact.became_hot": "Cliente pediu atenção",
  "contact.lifecycle_changed": "Contato mudou de fase",
  "customer.new": "Virou cliente",
  "nps.answered": "Respondeu a pesquisa de satisfação",
  "deal.created": "Cliente entrou na carteira",
  "deal.stage_changed": "Cliente mudou de etapa na carteira",
  "deal.won": "Cliente fidelizado",
  "deal.lost": "Cliente perdido",
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
    case "inactive":
      return `Cliente sem conversa há ${t.days ?? 30} dia(s)`;
    case "date": {
      const key = t.field?.replace(/^custom\./, "");
      const field = key === "ultima_compra" ? "data da compra" : (key ?? "uma data");
      const n = t.days_before ?? 0;
      return n < 0 ? `${-n} dia(s) depois de ${field}` : `${n} dia(s) antes de ${field}`;
    }
    default:
      return "Inscrição manual";
  }
}

/** O gatilho existe nesta edição? Eventos de e-mail e de ligação dependem de outro canal. */
export function eventInEdition(event: string, edition: Edition = EDITION): boolean {
  if (event.startsWith("email.")) return hasChannel("email", edition);
  if (event.startsWith("call.")) return hasChannel("phone", edition);
  // proposta é recurso de venda: só na edição completa
  if (event.startsWith("proposal.")) return edition.allIntegrations;
  return true;
}
