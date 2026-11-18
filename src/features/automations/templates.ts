// Modelos prontos: cada um já nasce com gatilho, passos e regras de saída sensatos.
import { EDITION, hasChannel, type Edition } from "@/lib/edition";

import type { AutoNode, ExitRules, Graph, Trigger } from "./engine";

export interface AutomationTemplate {
  key: string;
  name: string;
  description: string;
  kind: "journey" | "sequence" | "rule";
  trigger: Trigger;
  exit_rules?: Partial<ExitRules>;
  graph: Graph;
}

function chain(nodes: Omit<AutoNode, "position">[]): Graph {
  const map: Record<string, AutoNode> = {};
  nodes.forEach((n, i) => {
    map[n.id] = { ...n, position: { x: 260, y: 140 + i * 130 } };
  });
  return { start: nodes[0]?.id ?? null, nodes: map };
}

const DAY = 1440;

export const TEMPLATES: AutomationTemplate[] = [
  {
    key: "boas_vindas",
    name: "Boas-vindas de quem preencheu o formulário",
    description:
      "Quem preenche um formulário recebe WhatsApp na hora, e-mail com material e uma tarefa para o atendente se não responder.",
    kind: "journey",
    trigger: { type: "event", event: "form.submitted" },
    graph: chain([
      {
        id: "w1",
        type: "whatsapp",
        config: {
          text: "Oi {{primeiro_nome}}! Recebemos seu contato. Posso te ajudar agora por aqui?",
          category: "service",
        },
        next: "e1",
      },
      {
        id: "e1",
        type: "email",
        config: {
          subject: "{{primeiro_nome}}, aqui está o que você pediu",
          body: "Olá, {{primeiro_nome}}.\n\nObrigado pelo interesse. Separei um resumo de como podemos ajudar.\n\nQualquer dúvida, é só responder este e-mail.",
          category: "transactional",
        },
        next: "we",
      },
      {
        id: "we",
        type: "wait_event",
        config: { event: "replied", timeout_minutes: DAY },
        yes: "end",
        no: "t1",
      },
      {
        id: "t1",
        type: "task",
        config: {
          title: "Ligar para {{nome}} (contato novo sem resposta)",
          type: "call",
          due_in_minutes: 60,
        },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  },
  {
    key: "recuperacao",
    name: "Recuperação de quem não respondeu",
    description:
      "Conversa parada há 24 h: lembrete no WhatsApp, depois e-mail, depois aviso ao atendente.",
    kind: "sequence",
    trigger: { type: "no_reply", hours: 24 },
    graph: chain([
      {
        id: "w1",
        type: "whatsapp",
        config: {
          text: "Oi {{primeiro_nome}}, tudo bem? Fiquei de te retornar sobre a nossa conversa. Ainda faz sentido?",
          category: "service",
        },
        next: "wt",
      },
      { id: "wt", type: "wait", config: { minutes: 2 * DAY }, next: "e1" },
      {
        id: "e1",
        type: "email",
        config: {
          subject: "Ainda posso ajudar, {{primeiro_nome}}?",
          body: "Olá, {{primeiro_nome}}.\n\nNão quero insistir, mas queria saber se ainda precisa de ajuda. Se preferir, me diga o melhor horário para conversarmos.",
        },
        next: "n1",
      },
      {
        id: "n1",
        type: "notify",
        config: { title: "{{nome}} não respondeu em 3 dias", body: "Vale uma ligação." },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  },
  {
    key: "lembrete_reuniao",
    name: "Lembrete de reunião",
    description: "Quando uma reunião é marcada: confirmação imediata e lembrete no dia.",
    kind: "journey",
    trigger: { type: "event", event: "meeting.scheduled" },
    exit_rules: { on_meeting: false, on_reply: false },
    graph: chain([
      {
        id: "w1",
        type: "whatsapp",
        config: {
          text: "{{primeiro_nome}}, reunião confirmada! Você recebe o link por e-mail. Qualquer imprevisto, me avise por aqui.",
          category: "utility",
        },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  },
  {
    key: "pos_venda_nps",
    name: "Pós-venda com NPS",
    description:
      "Cliente fidelizado na carteira: boas-vindas, check-in em 7 dias e pesquisa de satisfação em 30.",
    kind: "journey",
    trigger: { type: "event", event: "deal.won" },
    exit_rules: { on_customer: false, on_reply: false, on_meeting: false },
    graph: chain([
      {
        id: "e1",
        type: "email",
        config: {
          subject: "Bem-vindo(a), {{primeiro_nome}}!",
          body: "Que alegria ter você com a gente. Nos próximos dias vamos acompanhar de perto o início.",
          category: "transactional",
        },
        next: "wt",
      },
      { id: "wt", type: "wait", config: { minutes: 7 * DAY }, next: "w1" },
      {
        id: "w1",
        type: "whatsapp",
        config: {
          text: "Oi {{primeiro_nome}}, como está sendo a primeira semana? Precisa de algo?",
          category: "service",
        },
        next: "wt2",
      },
      { id: "wt2", type: "wait", config: { minutes: 23 * DAY }, next: "e2" },
      {
        id: "e2",
        type: "email",
        config: {
          subject: "De 0 a 10, quanto você nos recomendaria?",
          body: "Sua opinião ajuda muito. Responda este e-mail com uma nota de 0 a 10 e, se quiser, o motivo.",
          category: "transactional",
        },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  },
  {
    key: "reativacao",
    name: "Reativação de inativos",
    description:
      "Contatos sem interação há 90 dias recebem uma oferta e, se clicarem, viram tarefa para o atendente.",
    kind: "journey",
    trigger: { type: "manual" },
    graph: chain([
      {
        id: "e1",
        type: "email",
        config: {
          subject: "{{primeiro_nome}}, faz tempo! Temos novidades",
          body: "Olá, {{primeiro_nome}}.\n\nPreparamos uma condição especial para quem já conversou com a gente.",
        },
        next: "wt",
      },
      { id: "wt", type: "wait", config: { minutes: 3 * DAY }, next: "c1" },
      { id: "c1", type: "condition", config: { kind: "clicked" }, yes: "t1", no: "end" },
      {
        id: "t1",
        type: "task",
        config: {
          title: "{{nome}} clicou na oferta de reativação",
          type: "call",
          due_in_minutes: 30,
        },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  },
  {
    key: "renovacao",
    name: "Renovação de contrato",
    description:
      "30 dias antes da data de renovação (campo personalizado): aviso ao cliente e tarefa ao responsável.",
    kind: "journey",
    trigger: { type: "date", field: "custom.renovacao", days_before: 30 },
    exit_rules: { on_customer: false },
    graph: chain([
      {
        id: "e1",
        type: "email",
        config: {
          subject: "Sua renovação está chegando",
          body: "Olá, {{primeiro_nome}}. Seu contrato renova em 30 dias. Quer revisar o plano com a gente?",
          category: "transactional",
        },
        next: "t1",
      },
      {
        id: "t1",
        type: "task",
        config: { title: "Renovação de {{nome}} em 30 dias", type: "call", due_in_minutes: 0 },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  },
  {
    key: "cadencia_sdr",
    name: "Cadência de contato ativo",
    description:
      "5 toques em 10 dias alternando WhatsApp, e-mail e ligação. Pausa sozinha quando o contato responde.",
    kind: "sequence",
    trigger: { type: "manual" },
    graph: chain([
      {
        id: "w1",
        type: "whatsapp",
        config: {
          text: "Oi {{primeiro_nome}}, aqui é {{vendedor}}. Vi que vocês na {{empresa}} podem se beneficiar do que fazemos. Faz sentido uma conversa rápida?",
          category: "marketing",
        },
        next: "wt1",
      },
      { id: "wt1", type: "wait", config: { minutes: 2 * DAY }, next: "e1" },
      {
        id: "e1",
        type: "email",
        config: {
          subject: "{{primeiro_nome}}, uma ideia para a {{empresa}}",
          body: "Olá, {{primeiro_nome}}.\n\nTe escrevo porque ajudamos empresas como a {{empresa}} a vender mais com menos esforço. Posso te mostrar em 15 minutos?",
        },
        next: "wt2",
      },
      { id: "wt2", type: "wait", config: { minutes: 2 * DAY }, next: "t1" },
      {
        id: "t1",
        type: "task",
        config: {
          title: "Ligar para {{nome}} (cadência, toque 3)",
          type: "call",
          due_in_minutes: 0,
        },
        next: "wt3",
      },
      { id: "wt3", type: "wait", config: { minutes: 3 * DAY }, next: "w2" },
      {
        id: "w2",
        type: "whatsapp",
        config: {
          text: "{{primeiro_nome}}, última tentativa por aqui: quer que eu te mande um resumo por escrito?",
          category: "marketing",
        },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  },
];

/** Algum passo depende de um canal que a edição não tem? */
function needsMissingChannel(t: AutomationTemplate, edition: Edition): boolean {
  return Object.values(t.graph.nodes).some((n) => {
    if (n.type === "email") return !hasChannel("email", edition);
    if (n.type === "sms") return !hasChannel("sms", edition);
    if (n.type === "voice_call") return !hasChannel("phone", edition);
    if (n.type === "task") {
      const kind = n.config["type"];
      if (kind === "call") return !hasChannel("phone", edition);
      if (kind === "email") return !hasChannel("email", edition);
    }
    return false;
  });
}

/** Modelos de captação de cliente novo: só na edição completa. */
const SALES_TEMPLATES: ReadonlySet<string> = new Set(["cadencia_sdr"]);

/** Modelos que a galeria mostra: fora os que usam e-mail, SMS ou ligação sem o canal. */
export function templatesFor(edition: Edition = EDITION): AutomationTemplate[] {
  return TEMPLATES.filter(
    (t) =>
      !needsMissingChannel(t, edition) && (edition.allIntegrations || !SALES_TEMPLATES.has(t.key)),
  );
}

export function blankGraph(): Graph {
  return {
    start: "end",
    nodes: { end: { id: "end", type: "end", config: {}, position: { x: 260, y: 140 } } },
  };
}
