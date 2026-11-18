// A automação lida como frase: "Quando um formulário é enviado → manda WhatsApp → se não responder
// em 1 dia, cria tarefa". Monta do gatilho e dos nós reais do grafo, seguindo o caminho principal.
import { formatMinutes, type AutoNode, type Graph, type NodeType, type Trigger } from "./engine";
import { EVENT_LABEL } from "./triggerSummary";

const TRIGGER_PHRASE: Record<string, string> = {
  "contact.created": "Quando um contato é criado",
  "contact.became_hot": "Quando um cliente pede atenção",
  "contact.lifecycle_changed": "Quando um contato muda de fase",
  "customer.new": "Quando alguém vira cliente",
  "nps.answered": "Quando o cliente responde a pesquisa",
  "deal.created": "Quando um cliente entra na carteira",
  "deal.stage_changed": "Quando um cliente muda de etapa na carteira",
  "deal.won": "Quando um cliente é fidelizado",
  "deal.lost": "Quando um cliente é perdido",
  "message.received": "Quando chega uma mensagem",
  "form.submitted": "Quando um formulário é enviado",
  "meeting.scheduled": "Quando uma reunião é marcada",
  "meeting.ended": "Quando uma reunião termina",
  "meeting.no_show": "Quando o contato falta à reunião",
  "meeting.confirmed": "Quando o contato confirma a reunião",
  "meeting.canceled": "Quando o contato cancela a reunião",
  "meeting.rescheduled": "Quando o contato remarca a reunião",
  "call.ended": "Quando uma ligação termina",
  "email.opened": "Quando o contato abre um e-mail",
  "email.clicked": "Quando o contato clica num e-mail",
  "ticket.created": "Quando um chamado é aberto",
  "ticket.resolved": "Quando um chamado é resolvido",
  "proposal.viewed": "Quando o contato abre a proposta",
  "proposal.accepted": "Quando o contato aceita a proposta",
  "payment.confirmed": "Quando um pagamento é confirmado",
};

export function triggerPhrase(t: Trigger): string {
  switch (t.type) {
    case "event": {
      const e = t.event ?? "";
      return TRIGGER_PHRASE[e] ?? `Quando: ${(EVENT_LABEL[e] ?? (e || "um evento")).toLowerCase()}`;
    }
    case "segment":
      return "Quando alguém entra no segmento";
    case "no_reply":
      return `Quando a conversa fica ${t.hours ?? 24} h sem resposta`;
    case "inactive":
      return `Quando o cliente fica ${t.days ?? 30} dias sem conversa`;
    case "date": {
      const key = t.field?.replace(/^custom\./, "");
      const field = key === "ultima_compra" ? "data da compra" : (key ?? "uma data");
      const n = t.days_before ?? 0;
      // dias negativos = depois da data (regras de pós-venda contadas da compra)
      if (n < 0) return `${-n} dia${n === -1 ? "" : "s"} depois de ${field}`;
      return `${n} dia${n === 1 ? "" : "s"} antes de ${field}`;
    }
    default:
      return "Quando você inscreve alguém";
  }
}

const WAIT_EVENT: Record<string, string> = {
  opened: "abrir o e-mail",
  clicked: "clicar no e-mail",
  replied: "responder",
  meeting: "marcar reunião",
};

const CONDITION: Record<string, string> = {
  opened: "abriu o e-mail",
  clicked: "clicou no e-mail",
  replied: "respondeu",
  meeting: "marcou reunião",
  score_gte: "o score é pelo menos",
  lifecycle_eq: "a fase é",
  temperature_eq: "a temperatura é",
  has_tag: "tem a etiqueta",
  field_eq: "o campo é",
};

function str(c: Record<string, unknown>, k: string): string {
  const v = c[k];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

export function stepPhrase(n: AutoNode): string {
  const c = n.config ?? {};
  switch (n.type) {
    case "whatsapp":
      return "manda WhatsApp";
    case "email":
      return "manda e-mail";
    case "sms":
      return "manda SMS";
    case "voice_call":
      return "liga com o agente de voz";
    case "task":
      return "cria tarefa para o atendente";
    case "ticket":
      return "abre um chamado";
    case "notify":
      return "avisa a equipe";
    case "assign":
      return "distribui para a equipe";
    case "move_stage":
      return "move o cliente de etapa na carteira";
    case "add_tag":
      return str(c, "tag") ? `põe a etiqueta ${str(c, "tag")}` : "põe uma etiqueta";
    case "remove_tag":
      return str(c, "tag") ? `tira a etiqueta ${str(c, "tag")}` : "tira uma etiqueta";
    case "set_field":
      return "atualiza um campo";
    case "ai_toggle":
      return c["enabled"] ? "liga a IA na conversa" : "desliga a IA na conversa";
    case "wait":
      return `espera ${formatMinutes(Number(c["minutes"] ?? 60))}`;
    case "wait_event": {
      const ev = WAIT_EVENT[str(c, "event")] ?? "agir";
      return `se não ${ev} em ${formatMinutes(Number(c["timeout_minutes"] ?? 1440))},`;
    }
    case "condition": {
      const k = CONDITION[str(c, "kind")] ?? "a condição bater";
      const v = str(c, "value");
      return `se ${k}${v ? ` ${v}` : ""},`;
    }
    case "ab_split":
      return "divide em dois grupos";
    case "webhook":
      return "envia para outro sistema";
    case "ai_agent":
      return str(c, "agent_name") ? `${str(c, "agent_name")} assume` : "a IA assume";
    case "composio_action":
      return str(c, "tool_label") || "roda uma ação em outro app";
    case "end":
      return "encerra";
  }
}

export interface SentenceStep {
  id: string;
  type: NodeType;
  text: string;
}
export interface Sentence {
  trigger: string;
  steps: SentenceStep[];
  more: number;
}

// Qual ramo conta a história: em "espera um evento" é o do prazo que acabou (é ali que a automação
// age); em condição e teste A/B é o "sim"/grupo A. Se o ramo escolhido acaba, segue pelo outro.
function nextId(n: AutoNode, g: Graph): string | null {
  const live = (id: string | null | undefined) =>
    id && g.nodes[id] && g.nodes[id]?.type !== "end" ? id : null;
  if (n.type === "wait_event") return live(n.no) ?? live(n.yes);
  if (n.type === "condition" || n.type === "ab_split") return live(n.yes) ?? live(n.no);
  return n.next ?? null;
}

export function buildSentence(trigger: Trigger, graph: Graph, max = 4): Sentence {
  const all: SentenceStep[] = [];
  const seen = new Set<string>();
  let id = graph.start;
  while (id && !seen.has(id)) {
    seen.add(id);
    const n = graph.nodes[id];
    if (!n || n.type === "end") break;
    // "se não responder em 1 dia," sem nada depois não diz nada: só entra se houver passo seguinte.
    const after = nextId(n, graph);
    if (!((n.type === "wait_event" || n.type === "condition") && !after)) {
      all.push({ id: n.id, type: n.type, text: stepPhrase(n) });
    }
    id = after;
  }
  return {
    trigger: triggerPhrase(trigger),
    steps: all.slice(0, max),
    more: Math.max(0, all.length - max),
  };
}
