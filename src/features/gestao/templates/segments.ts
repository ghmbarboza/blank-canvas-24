// Modelos prontos por segmento. Cada modelo aplica de uma vez: funil e etapas, campos, respostas
// rápidas (macros), cadências (em rascunho), textos dos agentes de IA e o formulário de qualidade.
// Agentes e formulário de qualidade são de outras áreas: vão como jsonb em account_templates
// (area "agents" e "qa_form"), que as outras frentes leem depois. Nada aqui depende delas.
//
// Textos de agente seguem o feed-the-LLM: dizem quem é, o objetivo, o que consultar e os limites.
// Não são roteiro nem árvore de decisão; o modelo decide com o contexto do CRM.
import type { AutoNode, Graph, Trigger } from "@/features/automations/engine";

export type SegmentKey =
  "clinica" | "imobiliaria" | "varejo" | "saas_b2b" | "stand_automovel" | "escola";

export interface SegmentStage {
  name: string;
  kind: "open" | "won" | "lost";
  probability: number;
  color: "slate" | "sky" | "violet" | "amber" | "orange" | "emerald" | "rose" | "teal";
}

export interface SegmentField {
  entity: "contact" | "company" | "deal";
  key: string;
  label: string;
  type:
    | "text"
    | "long_text"
    | "number"
    | "money"
    | "date"
    | "select"
    | "multiselect"
    | "boolean"
    | "url"
    | "email"
    | "phone";
  options?: string[];
  help?: string;
}

export interface SegmentMacro {
  shortcut: string;
  title: string;
  body: string;
}

export interface SegmentCadence {
  template_key: string;
  name: string;
  description: string;
  trigger: Trigger;
  graph: Graph;
}

export interface SegmentAgent {
  role: "sdr" | "sac" | "agendamento" | "cobranca" | "pos_venda";
  name: string;
  goal: string;
  instructions: string;
  handoff: string;
  tools: string[];
}

export interface QaCriterion {
  key: string;
  label: string;
  weight: number;
  eliminatory?: boolean;
  description: string;
}

export interface SegmentModel {
  version: string;
  pipelines: { name: string; stages: SegmentStage[] }[];
  fields: SegmentField[];
  macros: SegmentMacro[];
  cadences: SegmentCadence[];
  agents: SegmentAgent[];
  qa_form: { name: string; criteria: QaCriterion[] };
}

export interface SegmentTemplate {
  key: SegmentKey;
  name: string;
  pitch: string;
  model: SegmentModel;
}

const DAY = 1440;
const VERSION = "2026-10-27";

function chain(nodes: Omit<AutoNode, "position">[]): Graph {
  const map: Record<string, AutoNode> = {};
  nodes.forEach((n, i) => {
    map[n.id] = { ...n, position: { x: 260, y: 140 + i * 130 } };
  });
  return { start: nodes[0]?.id ?? null, nodes: map };
}

/** Cadência padrão: mensagem → espera resposta → lembrete → tarefa para a pessoa. */
function followUp(
  key: SegmentKey,
  slug: string,
  name: string,
  description: string,
  trigger: Trigger,
  first: string,
  second: string,
  task: string,
): SegmentCadence {
  return {
    template_key: `seg_${key}_${slug}`.slice(0, 60),
    name,
    description,
    trigger,
    graph: chain([
      { id: "w1", type: "whatsapp", config: { text: first, category: "service" }, next: "we" },
      {
        id: "we",
        type: "wait_event",
        config: { event: "replied", timeout_minutes: DAY },
        yes: "end",
        no: "w2",
      },
      { id: "w2", type: "whatsapp", config: { text: second, category: "service" }, next: "wt" },
      { id: "wt", type: "wait", config: { minutes: 2 * DAY }, next: "t1" },
      {
        id: "t1",
        type: "task",
        config: { title: task, type: "call", due_in_minutes: 120 },
        next: "end",
      },
      { id: "end", type: "end", config: {} },
    ]),
  };
}

const COMMON_CRITERIA: QaCriterion[] = [
  {
    key: "entendeu",
    label: "Entendeu o que o cliente queria",
    weight: 25,
    description: "Repetiu ou confirmou a necessidade antes de responder.",
  },
  {
    key: "resolveu",
    label: "Resolveu ou deu o próximo passo claro",
    weight: 25,
    description: "Cliente saiu com resposta ou com data e dono do próximo passo.",
  },
  {
    key: "tom",
    label: "Tom de gente, sem roteiro",
    weight: 15,
    description: "Conversa natural, espelha o jeito do cliente, sem repetir saudação.",
  },
  {
    key: "registro",
    label: "Registrou no CRM",
    weight: 15,
    description: "Campos e etapa atualizados com o que foi conversado.",
  },
  {
    key: "promessa",
    label: "Prometeu o que não pode",
    weight: 0,
    eliminatory: true,
    description: "Prazo, preço ou condição fora do que a empresa oferece.",
  },
  {
    key: "dado_sensivel",
    label: "Pediu ou expôs dado sensível sem necessidade",
    weight: 0,
    eliminatory: true,
    description: "Senha, cartão completo ou dado de saúde fora do fluxo seguro.",
  },
];

const AGENT_LIMITS =
  "Use o histórico do cliente em todos os canais e os dados do CRM antes de responder. Nunca invente preço, prazo ou condição: se não está na base, diga que vai confirmar e passe para uma pessoa. Se perguntarem se é robô, responda com honestidade e siga ajudando.";

export const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  {
    key: "clinica",
    name: "Clínica e consultório",
    pitch: "Agenda cheia e paciente que volta: confirmação de consulta, retorno e avaliação.",
    model: {
      version: VERSION,
      pipelines: [
        {
          name: "Pacientes novos",
          stages: [
            { name: "Primeiro contato", kind: "open", probability: 10, color: "slate" },
            { name: "Avaliação agendada", kind: "open", probability: 40, color: "sky" },
            { name: "Compareceu", kind: "open", probability: 70, color: "violet" },
            { name: "Tratamento fechado", kind: "won", probability: 100, color: "emerald" },
            { name: "Não seguiu", kind: "lost", probability: 0, color: "rose" },
          ],
        },
      ],
      fields: [
        {
          entity: "contact",
          key: "convenio",
          label: "Convênio",
          type: "select",
          options: ["Particular", "Unimed", "Bradesco Saúde", "SulAmérica", "Amil", "Outro"],
        },
        {
          entity: "contact",
          key: "especialidade",
          label: "Especialidade de interesse",
          type: "text",
        },
        { entity: "contact", key: "data_nascimento", label: "Data de nascimento", type: "date" },
        { entity: "deal", key: "procedimento", label: "Procedimento", type: "text" },
        { entity: "contact", key: "ultima_consulta", label: "Última consulta", type: "date" },
      ],
      macros: [
        {
          shortcut: "confirma",
          title: "Confirmar consulta",
          body: "Oi, {{primeiro_nome}}. Sua consulta está marcada para {{data}}. Posso confirmar sua presença?",
        },
        {
          shortcut: "remarcar",
          title: "Remarcar",
          body: "Sem problema, {{primeiro_nome}}. Me diga dois horários que funcionam para você e eu vejo a agenda.",
        },
        {
          shortcut: "convenio",
          title: "Pergunta de convênio",
          body: "Você vai usar convênio ou particular? Se for convênio, me mande o nome e o número da carteirinha.",
        },
        {
          shortcut: "preparo",
          title: "Preparo do exame",
          body: "Para o exame, siga as orientações que vou te mandar por aqui. Qualquer dúvida, é só responder.",
        },
      ],
      cadences: [
        followUp(
          "clinica",
          "retorno",
          "Lembrete de retorno",
          "Paciente que não marcou retorno recebe lembrete e vira tarefa para a recepção.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Já está na hora do seu retorno. Quer que eu veja um horário para você esta semana?",
          "{{primeiro_nome}}, ainda consigo um horário para o seu retorno. Prefere manhã ou tarde?",
          "Ligar para {{nome}} sobre o retorno",
        ),
        followUp(
          "clinica",
          "orcamento",
          "Orçamento sem resposta",
          "Quem pediu orçamento e sumiu recebe acompanhamento.",
          { type: "no_reply", hours: 48 },
          "Oi, {{primeiro_nome}}. Ficou alguma dúvida sobre o orçamento que te passei?",
          "{{primeiro_nome}}, se quiser, marco uma avaliação sem compromisso para você conhecer a clínica.",
          "Ligar para {{nome}}: orçamento parado",
        ),
      ],
      agents: [
        {
          role: "agendamento",
          name: "Recepção",
          goal: "Marcar, confirmar e remarcar consultas sem fila de espera.",
          instructions: `Você é da recepção da clínica. Consulte a agenda, o convênio e o histórico do paciente antes de oferecer horário. Ofereça no máximo dois horários por vez. ${AGENT_LIMITS}`,
          handoff: "Dúvida clínica, sintoma, urgência ou reclamação vai para a equipe com resumo.",
          tools: ["agenda", "crm", "base_de_conhecimento"],
        },
        {
          role: "sac",
          name: "Atendimento ao paciente",
          goal: "Responder dúvidas de preparo, valores e convênios com a base da clínica.",
          instructions: `Responda com base nas orientações cadastradas. Nunca dê orientação médica nem diagnóstico. ${AGENT_LIMITS}`,
          handoff:
            "Qualquer pergunta sobre sintoma, remédio ou resultado de exame vai para a equipe.",
          tools: ["base_de_conhecimento", "crm"],
        },
      ],
      qa_form: {
        name: "Qualidade do atendimento da clínica",
        criteria: [
          ...COMMON_CRITERIA,
          {
            key: "orientacao_medica",
            label: "Deu orientação médica",
            weight: 0,
            eliminatory: true,
            description: "Só profissional de saúde orienta sobre sintoma e tratamento.",
          },
        ],
      },
    },
  },
  {
    key: "imobiliaria",
    name: "Imobiliária",
    pitch: "Do anúncio à visita: qualificação do interessado, agenda de visita e proposta.",
    model: {
      version: VERSION,
      pipelines: [
        {
          name: "Venda e locação",
          stages: [
            { name: "Interessado", kind: "open", probability: 10, color: "slate" },
            { name: "Qualificado", kind: "open", probability: 25, color: "sky" },
            { name: "Visita marcada", kind: "open", probability: 45, color: "violet" },
            { name: "Proposta", kind: "open", probability: 70, color: "amber" },
            { name: "Contrato assinado", kind: "won", probability: 100, color: "emerald" },
            { name: "Desistiu", kind: "lost", probability: 0, color: "rose" },
          ],
        },
      ],
      fields: [
        {
          entity: "deal",
          key: "finalidade",
          label: "Finalidade",
          type: "select",
          options: ["Comprar", "Alugar", "Investir"],
        },
        { entity: "deal", key: "faixa_preco", label: "Faixa de preço", type: "money" },
        { entity: "deal", key: "bairros", label: "Bairros de interesse", type: "text" },
        { entity: "deal", key: "quartos", label: "Quartos", type: "number" },
        { entity: "deal", key: "codigo_imovel", label: "Código do imóvel", type: "text" },
        { entity: "contact", key: "financiamento", label: "Vai financiar", type: "boolean" },
      ],
      macros: [
        {
          shortcut: "visita",
          title: "Marcar visita",
          body: "{{primeiro_nome}}, consigo te levar para ver o imóvel. Qual dia e horário ficam bons?",
        },
        {
          shortcut: "documentos",
          title: "Documentos para proposta",
          body: "Para seguir com a proposta, preciso de RG, CPF, comprovante de renda e de residência. Pode mandar por aqui.",
        },
        {
          shortcut: "similares",
          title: "Imóveis parecidos",
          body: "Separei outras opções no mesmo perfil. Quer que eu mande as fotos?",
        },
      ],
      cadences: [
        followUp(
          "imobiliaria",
          "pos_visita",
          "Depois da visita",
          "Interessado que visitou recebe acompanhamento para a proposta.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. O que achou do imóvel? Ficou alguma dúvida?",
          "{{primeiro_nome}}, se quiser, já preparo uma simulação de proposta para você avaliar com calma.",
          "Ligar para {{nome}} depois da visita",
        ),
        followUp(
          "imobiliaria",
          "lead_portal",
          "Lead de portal",
          "Quem chegou pelo portal recebe resposta rápida e é qualificado.",
          { type: "event", event: "form.submitted" },
          "Oi, {{primeiro_nome}}. Vi seu interesse no imóvel. Você procura para morar ou investir?",
          "{{primeiro_nome}}, tenho horários de visita nesta semana. Quer que eu reserve um?",
          "Ligar para {{nome}} (lead de portal sem resposta)",
        ),
      ],
      agents: [
        {
          role: "sdr",
          name: "Corretor virtual",
          goal: "Qualificar o interessado e marcar a visita com o corretor certo.",
          instructions: `Descubra finalidade, faixa de preço, bairros e prazo conversando, sem questionário. Use os imóveis cadastrados para sugerir opções. ${AGENT_LIMITS}`,
          handoff: "Proposta, negociação de valor e documentação vão para o corretor com resumo.",
          tools: ["catalogo", "agenda", "crm"],
        },
      ],
      qa_form: { name: "Qualidade do atendimento imobiliário", criteria: COMMON_CRITERIA },
    },
  },
  {
    key: "varejo",
    name: "Varejo e loja",
    pitch: "Pedido, troca e recompra: atendimento rápido no WhatsApp e cliente que volta.",
    model: {
      version: VERSION,
      pipelines: [
        {
          name: "Pedidos",
          stages: [
            { name: "Orçamento", kind: "open", probability: 20, color: "slate" },
            { name: "Aguardando pagamento", kind: "open", probability: 60, color: "sky" },
            { name: "Pago", kind: "won", probability: 100, color: "emerald" },
            { name: "Desistiu", kind: "lost", probability: 0, color: "rose" },
          ],
        },
      ],
      fields: [
        { entity: "contact", key: "tamanho", label: "Tamanho preferido", type: "text" },
        { entity: "contact", key: "ultima_compra", label: "Última compra", type: "date" },
        { entity: "deal", key: "numero_pedido", label: "Número do pedido", type: "text" },
        {
          entity: "deal",
          key: "forma_entrega",
          label: "Entrega",
          type: "select",
          options: ["Retirar na loja", "Entrega", "Correios"],
        },
      ],
      macros: [
        {
          shortcut: "pix",
          title: "Pagamento por Pix",
          body: "Pode pagar pelo Pix que vou te mandar agora. Assim que cair, eu separo o pedido.",
        },
        {
          shortcut: "troca",
          title: "Política de troca",
          body: "A troca pode ser feita em até 30 dias com a etiqueta. Me mande uma foto do produto e o número do pedido.",
        },
        {
          shortcut: "rastreio",
          title: "Rastreio",
          body: "Seu pedido saiu para entrega. O código de rastreio é {{codigo}}.",
        },
      ],
      cadences: [
        followUp(
          "varejo",
          "carrinho",
          "Orçamento parado",
          "Quem pediu orçamento e não pagou recebe lembrete.",
          { type: "no_reply", hours: 24 },
          "Oi, {{primeiro_nome}}. Separei o que você pediu. Quer que eu mande o link de pagamento?",
          "{{primeiro_nome}}, o item está reservado até amanhã. Posso garantir para você?",
          "Ligar para {{nome}}: orçamento sem pagamento",
        ),
        followUp(
          "varejo",
          "recompra",
          "Recompra",
          "Cliente sem compra há um tempo recebe novidade.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Chegou coisa nova que tem a sua cara. Quer ver?",
          "{{primeiro_nome}}, tenho uma condição boa para quem já é cliente esta semana.",
          "Ligar para {{nome}} (recompra)",
        ),
      ],
      agents: [
        {
          role: "sac",
          name: "Atendimento da loja",
          goal: "Responder sobre produto, estoque, pagamento, entrega e troca.",
          instructions: `Consulte o catálogo e o pedido antes de responder. Fale curto, como no WhatsApp. ${AGENT_LIMITS}`,
          handoff: "Reclamação, defeito e pedido de reembolso vão para uma pessoa.",
          tools: ["catalogo", "crm", "pagamento"],
        },
      ],
      qa_form: { name: "Qualidade do atendimento da loja", criteria: COMMON_CRITERIA },
    },
  },
  {
    key: "saas_b2b",
    name: "SaaS B2B",
    pitch: "Demonstração, teste, fechamento e renovação, com saúde do cliente no centro.",
    model: {
      version: VERSION,
      pipelines: [
        {
          name: "Novos negócios",
          stages: [
            { name: "Lead", kind: "open", probability: 5, color: "slate" },
            { name: "Qualificado", kind: "open", probability: 20, color: "sky" },
            { name: "Demonstração", kind: "open", probability: 40, color: "violet" },
            { name: "Proposta", kind: "open", probability: 60, color: "amber" },
            { name: "Negociação", kind: "open", probability: 80, color: "orange" },
            { name: "Ganho", kind: "won", probability: 100, color: "emerald" },
            { name: "Perdido", kind: "lost", probability: 0, color: "rose" },
          ],
        },
        {
          name: "Renovação",
          stages: [
            { name: "90 dias para renovar", kind: "open", probability: 70, color: "slate" },
            { name: "Em conversa", kind: "open", probability: 80, color: "sky" },
            { name: "Renovado", kind: "won", probability: 100, color: "emerald" },
            { name: "Cancelou", kind: "lost", probability: 0, color: "rose" },
          ],
        },
      ],
      fields: [
        { entity: "company", key: "funcionarios", label: "Funcionários", type: "number" },
        { entity: "company", key: "ferramenta_atual", label: "Ferramenta atual", type: "text" },
        { entity: "deal", key: "usuarios", label: "Licenças", type: "number" },
        { entity: "deal", key: "decisor", label: "Quem decide", type: "text" },
        { entity: "deal", key: "dor_principal", label: "Dor principal", type: "long_text" },
        { entity: "company", key: "data_renovacao", label: "Data de renovação", type: "date" },
      ],
      macros: [
        {
          shortcut: "demo",
          title: "Convite para demonstração",
          body: "{{primeiro_nome}}, que tal 30 minutos para eu te mostrar como resolvemos isso? Tenho horários amanhã e quinta.",
        },
        {
          shortcut: "proposta",
          title: "Envio de proposta",
          body: "Mandei a proposta no seu e-mail. Posso te ligar amanhã para passar os pontos principais?",
        },
        {
          shortcut: "onboarding",
          title: "Boas-vindas",
          body: "Bem-vindo(a), {{primeiro_nome}}. Vou te acompanhar na implantação. Qual o melhor horário para a primeira reunião?",
        },
      ],
      cadences: [
        followUp(
          "saas_b2b",
          "pos_demo",
          "Depois da demonstração",
          "Quem viu a demonstração recebe acompanhamento até a proposta.",
          { type: "event", event: "meeting.ended" },
          "{{primeiro_nome}}, obrigado pela conversa. Separei um resumo do que vimos. Posso mandar a proposta?",
          "{{primeiro_nome}}, ficou alguma dúvida do time? Posso fazer uma sessão rápida com eles.",
          "Ligar para {{nome}} depois da demonstração",
        ),
        followUp(
          "saas_b2b",
          "renovacao",
          "Renovação",
          "90 dias antes da renovação: conversa de valor e proposta.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Faltam alguns meses para a renovação. Quer marcar uma conversa para ver o que deu resultado?",
          "{{primeiro_nome}}, preparei um resumo do uso do seu time. Posso mandar?",
          "Ligar para {{nome}}: renovação chegando",
        ),
      ],
      agents: [
        {
          role: "sdr",
          name: "SDR",
          goal: "Qualificar a empresa e marcar a demonstração com o vendedor.",
          instructions: `Descubra dor, tamanho do time, ferramenta atual e quem decide, conversando. Use o site e os materiais da empresa como base. ${AGENT_LIMITS}`,
          handoff: "Preço, desconto e contrato vão para o vendedor com resumo.",
          tools: ["agenda", "crm", "base_de_conhecimento"],
        },
        {
          role: "pos_venda",
          name: "Sucesso do cliente",
          goal: "Acompanhar a implantação e sinalizar risco de cancelamento.",
          instructions: `Use a saúde do cliente, os chamados e o uso para puxar a conversa certa. ${AGENT_LIMITS}`,
          handoff: "Pedido de cancelamento ou insatisfação forte vai para o gestor da conta.",
          tools: ["crm", "chamados", "base_de_conhecimento"],
        },
      ],
      qa_form: {
        name: "Qualidade da venda consultiva",
        criteria: [
          ...COMMON_CRITERIA,
          {
            key: "descoberta",
            label: "Fez descoberta antes de apresentar",
            weight: 20,
            description: "Entendeu dor, impacto e decisor antes de falar do produto.",
          },
        ],
      },
    },
  },
  {
    key: "stand_automovel",
    name: "Stand automóvel",
    pitch: "A viatura no centro: interessados por carro, retoma, test drive e dias em stock.",
    model: {
      version: VERSION,
      pipelines: [
        {
          name: "Venda de viaturas",
          stages: [
            { name: "Interessado", kind: "open", probability: 10, color: "slate" },
            { name: "Test drive marcado", kind: "open", probability: 35, color: "sky" },
            { name: "Avaliação de retoma", kind: "open", probability: 50, color: "violet" },
            { name: "Proposta", kind: "open", probability: 70, color: "amber" },
            { name: "Vendido", kind: "won", probability: 100, color: "emerald" },
            { name: "Não avançou", kind: "lost", probability: 0, color: "rose" },
          ],
        },
      ],
      fields: [
        {
          entity: "deal",
          key: "viatura",
          label: "Viatura (matrícula ou referência)",
          type: "text",
        },
        { entity: "deal", key: "tem_retoma", label: "Tem retoma", type: "boolean" },
        { entity: "deal", key: "retoma_modelo", label: "Viatura da retoma", type: "text" },
        {
          entity: "deal",
          key: "financiamento",
          label: "Financiamento",
          type: "select",
          options: ["A pronto", "Crédito", "Leasing", "Ainda não sabe"],
        },
        { entity: "deal", key: "dias_em_stock", label: "Dias em stock da viatura", type: "number" },
      ],
      macros: [
        {
          shortcut: "testdrive",
          title: "Marcar test drive",
          body: "{{primeiro_nome}}, a viatura está disponível para test drive. Que dia lhe dá jeito?",
        },
        {
          shortcut: "retoma",
          title: "Avaliação de retoma",
          body: "Para avaliar a sua retoma, envie fotos, quilómetros e o ano da viatura.",
        },
        {
          shortcut: "simulacao",
          title: "Simulação de crédito",
          body: "Consigo fazer uma simulação de crédito. Qual a entrada e o prazo que pretende?",
        },
      ],
      cadences: [
        followUp(
          "stand_automovel",
          "interessado",
          "Interessado na viatura",
          "Quem perguntou por uma viatura recebe resposta e convite para test drive.",
          { type: "event", event: "form.submitted" },
          "Olá, {{primeiro_nome}}. A viatura que viu ainda está disponível. Quer marcar um test drive?",
          "{{primeiro_nome}}, tenho outras viaturas no mesmo perfil, se preferir comparar.",
          "Ligar a {{nome}}: interessado sem resposta",
        ),
        followUp(
          "stand_automovel",
          "pos_testdrive",
          "Depois do test drive",
          "Acompanhamento para a proposta.",
          { type: "manual" },
          "{{primeiro_nome}}, o que achou da viatura? Posso preparar a proposta com a retoma?",
          "{{primeiro_nome}}, a proposta fica válida até sexta. Quer avançar?",
          "Ligar a {{nome}} depois do test drive",
        ),
      ],
      agents: [
        {
          role: "sdr",
          name: "Comercial do stand",
          goal: "Responder sobre a viatura certa e marcar test drive ou avaliação de retoma.",
          instructions: `A viatura é a unidade de gestão: confirme sempre qual viatura o cliente quer e consulte o stock antes de responder. ${AGENT_LIMITS}`,
          handoff: "Preço final, valor da retoma e crédito vão para o comercial com resumo.",
          tools: ["catalogo", "agenda", "crm"],
        },
      ],
      qa_form: { name: "Qualidade do atendimento do stand", criteria: COMMON_CRITERIA },
    },
  },
  {
    key: "escola",
    name: "Escola e curso",
    pitch: "Captação de matrícula, visita, rematrícula e cobrança de mensalidade.",
    model: {
      version: VERSION,
      pipelines: [
        {
          name: "Matrículas",
          stages: [
            { name: "Interessado", kind: "open", probability: 10, color: "slate" },
            { name: "Visita ou aula experimental", kind: "open", probability: 40, color: "sky" },
            { name: "Proposta enviada", kind: "open", probability: 60, color: "violet" },
            { name: "Matriculado", kind: "won", probability: 100, color: "emerald" },
            { name: "Não matriculou", kind: "lost", probability: 0, color: "rose" },
          ],
        },
      ],
      fields: [
        { entity: "contact", key: "nome_aluno", label: "Nome do aluno", type: "text" },
        { entity: "contact", key: "serie", label: "Série ou turma de interesse", type: "text" },
        {
          entity: "contact",
          key: "turno",
          label: "Turno",
          type: "select",
          options: ["Manhã", "Tarde", "Integral", "Noite"],
        },
        { entity: "deal", key: "bolsa", label: "Bolsa ou desconto", type: "text" },
        {
          entity: "contact",
          key: "responsavel_financeiro",
          label: "Responsável financeiro",
          type: "text",
        },
      ],
      macros: [
        {
          shortcut: "visita",
          title: "Convite para visita",
          body: "{{primeiro_nome}}, que tal conhecer a escola? Tenho visitas na terça e na quinta às 10h.",
        },
        {
          shortcut: "documentos",
          title: "Documentos da matrícula",
          body: "Para a matrícula, precisamos de certidão, histórico escolar e comprovante de residência.",
        },
        {
          shortcut: "mensalidade",
          title: "Lembrete de mensalidade",
          body: "Oi, {{primeiro_nome}}. A mensalidade vence dia {{data}}. Posso mandar o boleto ou o Pix?",
        },
      ],
      cadences: [
        followUp(
          "escola",
          "pos_visita",
          "Depois da visita",
          "Família que visitou recebe acompanhamento até a matrícula.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Foi um prazer receber vocês. Ficou alguma dúvida sobre a escola?",
          "{{primeiro_nome}}, as vagas da turma estão fechando. Quer que eu reserve uma?",
          "Ligar para {{nome}} depois da visita",
        ),
        followUp(
          "escola",
          "rematricula",
          "Rematrícula",
          "Rematrícula com antecedência.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. A rematrícula para o próximo ano já abriu. Posso te mandar as condições?",
          "{{primeiro_nome}}, a condição de rematrícula antecipada vale até o fim do mês.",
          "Ligar para {{nome}}: rematrícula",
        ),
      ],
      agents: [
        {
          role: "sdr",
          name: "Secretaria",
          goal: "Responder famílias, marcar visita e conduzir a matrícula.",
          instructions: `Converse com o responsável, descubra série, turno e o que é importante para a família. Use a base com valores e calendário. ${AGENT_LIMITS}`,
          handoff: "Bolsa, desconto e questão pedagógica vão para a coordenação.",
          tools: ["agenda", "crm", "base_de_conhecimento"],
        },
        {
          role: "cobranca",
          name: "Financeiro",
          goal: "Lembrar vencimento e negociar atraso dentro da política da escola.",
          instructions: `Seja cordial e direto. Ofereça só as condições cadastradas. ${AGENT_LIMITS}`,
          handoff: "Acordo fora da política vai para o financeiro.",
          tools: ["pagamento", "crm"],
        },
      ],
      qa_form: { name: "Qualidade do atendimento da escola", criteria: COMMON_CRITERIA },
    },
  },
];

export function segmentTemplate(key: string): SegmentTemplate | undefined {
  return SEGMENT_TEMPLATES.find((t) => t.key === key);
}
