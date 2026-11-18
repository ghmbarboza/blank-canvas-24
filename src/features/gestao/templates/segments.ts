// Modelos prontos por segmento. Cada modelo aplica de uma vez: jornada e etapas, campos, respostas
// rápidas (macros), cadências (em rascunho), textos dos agentes de IA e o formulário de qualidade.
// Agentes e formulário de qualidade são de outras áreas: vão como jsonb em account_templates
// (area "agents" e "qa_form"), que as outras frentes leem depois. Nada aqui depende delas.
//
// Textos de agente seguem o feed-the-LLM: dizem quem é, o objetivo, o que consultar e os limites.
// Não são roteiro nem árvore de decisão; o modelo decide com o contexto do CRM.
import type { AutoNode, Graph, Trigger } from "@/features/automations/engine";
import { POS_VENDA_PIPELINE, POS_VENDA_STAGES } from "@/features/posvenda/journey";

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
    label: "Registrou na ficha do cliente",
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

// Todo ramo usa a jornada de pós-venda (features/posvenda/journey). Como apply_segment_template
// acha quadro e etapa pelo nome, aplicar um ramo numa conta nova não cria nada por cima do quadro
// "Pós-venda" que ela já tem; numa conta antiga, cria a jornada.
const POS_VENDA_PIPELINES: SegmentModel["pipelines"] = [
  { name: POS_VENDA_PIPELINE, stages: POS_VENDA_STAGES.map((st) => ({ ...st })) },
];

// Cada ramo traz o pós-venda dele: boas-vindas, acompanhamento, pesquisa de satisfação, recompra
// ou renovação e a volta de quem parou. As cadências entram em rascunho.
export const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  {
    key: "clinica",
    name: "Clínica e consultório",
    pitch: "Paciente bem cuidado volta: acompanhamento depois da consulta, retorno e avaliação.",
    model: {
      version: VERSION,
      pipelines: POS_VENDA_PIPELINES,
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
          label: "Especialidade em que é atendido",
          type: "text",
        },
        { entity: "contact", key: "data_nascimento", label: "Data de nascimento", type: "date" },
        { entity: "deal", key: "procedimento", label: "Procedimento realizado", type: "text" },
        { entity: "contact", key: "ultima_consulta", label: "Última consulta", type: "date" },
      ],
      macros: [
        {
          shortcut: "confirma",
          title: "Confirmar retorno",
          body: "Oi, {{primeiro_nome}}. Seu retorno está marcado para {{data}}. Posso confirmar sua presença?",
        },
        {
          shortcut: "remarcar",
          title: "Remarcar",
          body: "Sem problema, {{primeiro_nome}}. Me diga dois horários que funcionam para você e eu vejo a agenda.",
        },
        {
          shortcut: "pos_consulta",
          title: "Como está depois da consulta",
          body: "Oi, {{primeiro_nome}}. Como você está depois da consulta? Se ficou alguma dúvida sobre as orientações, é só me chamar.",
        },
        {
          shortcut: "preparo",
          title: "Preparo do exame",
          body: "Para o exame, siga as orientações que vou te mandar por aqui. Qualquer dúvida, é só responder.",
        },
        {
          shortcut: "avaliacao",
          title: "Pedir avaliação",
          body: "{{primeiro_nome}}, de 0 a 10, como foi o seu atendimento com a gente? Sua resposta ajuda a clínica a melhorar.",
        },
      ],
      cadences: [
        followUp(
          "clinica",
          "retorno",
          "Lembrete de retorno",
          "Paciente que não marcou o retorno recebe lembrete e vira tarefa para a recepção.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Já está na hora do seu retorno. Quer que eu veja um horário para você esta semana?",
          "{{primeiro_nome}}, ainda consigo um horário para o seu retorno. Prefere manhã ou tarde?",
          "Falar com {{nome}} sobre o retorno",
        ),
        followUp(
          "clinica",
          "orcamento",
          "Depois da consulta",
          "Quem passou por consulta ou procedimento recebe acompanhamento e a pesquisa de satisfação.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Como você está depois da consulta? Deu tudo certo com as orientações?",
          "{{primeiro_nome}}, de 0 a 10, como foi o seu atendimento com a gente? Sua opinião ajuda a clínica a melhorar.",
          "Falar com {{nome}}: sem resposta depois da consulta",
        ),
      ],
      agents: [
        {
          role: "agendamento",
          name: "Recepção",
          goal: "Marcar, confirmar e remarcar retornos sem fila de espera.",
          instructions: `Você é da recepção da clínica. Consulte a agenda, o convênio e o histórico do paciente antes de oferecer horário. Ofereça no máximo dois horários por vez. ${AGENT_LIMITS}`,
          handoff: "Dúvida clínica, sintoma, urgência ou reclamação vai para a equipe com resumo.",
          tools: ["agenda", "crm", "base_de_conhecimento"],
        },
        {
          role: "sac",
          name: "Atendimento ao paciente",
          goal: "Responder dúvidas de preparo, pós-consulta e convênios com a base da clínica.",
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
    pitch: "Depois do contrato: entrega das chaves, vistoria, manutenção e renovação da locação.",
    model: {
      version: VERSION,
      pipelines: POS_VENDA_PIPELINES,
      fields: [
        {
          entity: "deal",
          key: "finalidade",
          label: "Tipo de contrato",
          type: "select",
          options: ["Comprar", "Alugar", "Investir"],
        },
        { entity: "deal", key: "faixa_preco", label: "Valor do contrato", type: "money" },
        { entity: "deal", key: "bairros", label: "Bairro do imóvel", type: "text" },
        { entity: "deal", key: "quartos", label: "Quartos", type: "number" },
        { entity: "deal", key: "codigo_imovel", label: "Código do imóvel", type: "text" },
        { entity: "contact", key: "financiamento", label: "Imóvel financiado", type: "boolean" },
      ],
      macros: [
        {
          shortcut: "visita",
          title: "Marcar vistoria",
          body: "{{primeiro_nome}}, preciso marcar a vistoria do imóvel. Qual dia e horário ficam bons?",
        },
        {
          shortcut: "documentos",
          title: "Documentos da renovação",
          body: "Para renovar o contrato, preciso do comprovante de renda e de residência atualizados. Pode mandar por aqui.",
        },
        {
          shortcut: "similares",
          title: "Pedido de manutenção",
          body: "Recebi o seu pedido, {{primeiro_nome}}. Me mande uma foto e diga o melhor horário para a visita do técnico.",
        },
      ],
      cadences: [
        followUp(
          "imobiliaria",
          "pos_visita",
          "Depois da entrega das chaves",
          "Quem acabou de receber o imóvel recebe acompanhamento nos primeiros dias.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Como estão os primeiros dias no imóvel? Está tudo funcionando bem?",
          "{{primeiro_nome}}, se precisar de algum reparo ou tiver dúvida do contrato, é só me chamar por aqui.",
          "Falar com {{nome}} depois da entrega das chaves",
        ),
        followUp(
          "imobiliaria",
          "lead_portal",
          "Renovação do contrato",
          "Locação perto do vencimento recebe a conversa de renovação com antecedência.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. O seu contrato vence em breve. Quer que eu já prepare a renovação?",
          "{{primeiro_nome}}, consigo deixar a renovação pronta esta semana. Posso seguir?",
          "Falar com {{nome}}: renovação do contrato sem resposta",
        ),
      ],
      agents: [
        {
          role: "pos_venda",
          name: "Atendimento ao cliente",
          goal: "Acompanhar quem já comprou ou alugou: vistoria, manutenção, boleto e renovação.",
          instructions: `Confirme qual é o imóvel e o contrato do cliente antes de responder. Registre pedidos de reparo com o detalhe e a foto. ${AGENT_LIMITS}`,
          handoff:
            "Reajuste, rescisão, cobrança contestada e problema grave no imóvel vão para o responsável com resumo.",
          tools: ["agenda", "crm", "base_de_conhecimento"],
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
      pipelines: POS_VENDA_PIPELINES,
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
          title: "Pedido recebido",
          body: "Recebemos o seu pedido, {{primeiro_nome}}. Já estou separando e aviso assim que sair para entrega.",
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
          "Depois da entrega",
          "Quem recebeu o pedido recebe acompanhamento e a pesquisa de satisfação.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Seu pedido chegou direitinho? Ficou do jeito que você esperava?",
          "{{primeiro_nome}}, de 0 a 10, como foi comprar com a gente? Sua resposta ajuda a loja a melhorar.",
          "Falar com {{nome}}: sem resposta depois da entrega",
        ),
        followUp(
          "varejo",
          "recompra",
          "Recompra",
          "Cliente sem compra há um tempo recebe novidade.",
          { type: "inactive", days: 60 },
          "Oi, {{primeiro_nome}}. Chegou coisa nova que tem a sua cara. Quer ver?",
          "{{primeiro_nome}}, tenho uma condição boa para quem já é cliente esta semana.",
          "Falar com {{nome}} (recompra)",
        ),
      ],
      agents: [
        {
          role: "sac",
          name: "Atendimento da loja",
          goal: "Responder sobre pedido, entrega, troca e uso do produto.",
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
    pitch: "Implantação, uso e renovação, com a saúde do cliente no centro.",
    model: {
      version: VERSION,
      pipelines: POS_VENDA_PIPELINES,
      fields: [
        { entity: "company", key: "funcionarios", label: "Funcionários", type: "number" },
        { entity: "company", key: "ferramenta_atual", label: "Ferramenta anterior", type: "text" },
        { entity: "deal", key: "usuarios", label: "Licenças", type: "number" },
        { entity: "deal", key: "decisor", label: "Contato principal", type: "text" },
        { entity: "deal", key: "dor_principal", label: "Objetivo do cliente", type: "long_text" },
        { entity: "company", key: "data_renovacao", label: "Data de renovação", type: "date" },
      ],
      macros: [
        {
          shortcut: "demo",
          title: "Convite para treinamento",
          body: "{{primeiro_nome}}, que tal 30 minutos para eu mostrar ao seu time como tirar mais proveito? Tenho horários amanhã e quinta.",
        },
        {
          shortcut: "proposta",
          title: "Resumo de uso",
          body: "{{primeiro_nome}}, preparei um resumo de como o seu time está usando a ferramenta. Posso te passar os pontos principais amanhã?",
        },
        {
          shortcut: "onboarding",
          title: "Boas-vindas",
          body: "Bem-vindo(a), {{primeiro_nome}}. Vou te acompanhar na implantação. Qual o melhor horário para a nossa primeira conversa?",
        },
      ],
      cadences: [
        followUp(
          "saas_b2b",
          "pos_demo",
          "Implantação",
          "Cliente novo recebe acompanhamento até o time dele estar usando.",
          { type: "manual" },
          "{{primeiro_nome}}, como estão os primeiros dias de uso? O time já conseguiu entrar e fazer o básico?",
          "{{primeiro_nome}}, ficou alguma dúvida do time? Posso fazer uma sessão rápida com eles.",
          "Falar com {{nome}}: implantação sem resposta",
        ),
        followUp(
          "saas_b2b",
          "renovacao",
          "Renovação",
          "90 dias antes da renovação: conversa sobre o que deu resultado.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Faltam alguns meses para a renovação. Quer marcar uma conversa para ver o que deu resultado?",
          "{{primeiro_nome}}, preparei um resumo do uso do seu time. Posso mandar?",
          "Falar com {{nome}}: renovação chegando",
        ),
      ],
      agents: [
        {
          role: "sac",
          name: "Suporte",
          goal: "Tirar dúvidas de uso e resolver o que trava o dia a dia do cliente.",
          instructions: `Entenda o que o cliente está tentando fazer antes de responder e use a base de conhecimento. Abra chamado quando não resolver na conversa. ${AGENT_LIMITS}`,
          handoff:
            "Falha que afeta vários usuários, cobrança e contrato vão para a equipe com resumo.",
          tools: ["chamados", "crm", "base_de_conhecimento"],
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
        name: "Qualidade do acompanhamento do cliente",
        criteria: [
          ...COMMON_CRITERIA,
          {
            key: "descoberta",
            label: "Entendeu o objetivo do cliente antes de orientar",
            weight: 20,
            description: "Perguntou o que o cliente quer alcançar antes de explicar a ferramenta.",
          },
        ],
      },
    },
  },
  {
    key: "stand_automovel",
    name: "Stand automóvel",
    pitch: "Depois da entrega da viatura: garantia, revisão e o cliente que volta para trocar.",
    model: {
      version: VERSION,
      pipelines: POS_VENDA_PIPELINES,
      fields: [
        {
          entity: "deal",
          key: "viatura",
          label: "Viatura (matrícula ou referência)",
          type: "text",
        },
        { entity: "deal", key: "tem_retoma", label: "Entregou retoma", type: "boolean" },
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
          title: "Marcar revisão",
          body: "{{primeiro_nome}}, a sua viatura está na altura da revisão. Que dia lhe dá jeito?",
        },
        {
          shortcut: "retoma",
          title: "Pedido de garantia",
          body: "Para abrir o pedido de garantia, envie fotos, os quilómetros e uma descrição do que aconteceu.",
        },
        {
          shortcut: "simulacao",
          title: "Documentos da viatura",
          body: "{{primeiro_nome}}, os documentos da viatura estão prontos. Prefere levantar no stand ou receber por correio?",
        },
      ],
      cadences: [
        followUp(
          "stand_automovel",
          "interessado",
          "Depois da entrega da viatura",
          "Quem levantou a viatura recebe acompanhamento nos primeiros dias.",
          { type: "manual" },
          "Olá, {{primeiro_nome}}. Como estão os primeiros dias com a viatura? Está tudo como esperava?",
          "{{primeiro_nome}}, de 0 a 10, como foi a sua experiência no stand? A sua opinião ajuda-nos a melhorar.",
          "Ligar a {{nome}}: sem resposta depois da entrega",
        ),
        followUp(
          "stand_automovel",
          "pos_testdrive",
          "Revisão e garantia",
          "Lembrete da revisão e do fim da garantia.",
          { type: "manual" },
          "{{primeiro_nome}}, a sua viatura está na altura da revisão. Quer que marque um horário?",
          "{{primeiro_nome}}, tenho vaga na oficina esta semana. Posso reservar?",
          "Ligar a {{nome}}: revisão por marcar",
        ),
      ],
      agents: [
        {
          role: "pos_venda",
          name: "Apoio ao cliente do stand",
          goal: "Acompanhar quem já comprou: documentos, garantia, revisão e dúvidas da viatura.",
          instructions: `A viatura é a unidade de gestão: confirme sempre de qual viatura o cliente fala e consulte o histórico antes de responder. ${AGENT_LIMITS}`,
          handoff: "Avaria, pedido de garantia e reclamação vão para o responsável com resumo.",
          tools: ["catalogo", "agenda", "crm"],
        },
      ],
      qa_form: { name: "Qualidade do atendimento do stand", criteria: COMMON_CRITERIA },
    },
  },
  {
    key: "escola",
    name: "Escola e curso",
    pitch: "Família acompanhada o ano todo: boas-vindas, frequência, mensalidade e rematrícula.",
    model: {
      version: VERSION,
      pipelines: POS_VENDA_PIPELINES,
      fields: [
        { entity: "contact", key: "nome_aluno", label: "Nome do aluno", type: "text" },
        { entity: "contact", key: "serie", label: "Série ou turma", type: "text" },
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
          title: "Convite para reunião",
          body: "{{primeiro_nome}}, que tal uma conversa com a coordenação sobre o andamento do aluno? Tenho horários na terça e na quinta às 10h.",
        },
        {
          shortcut: "documentos",
          title: "Documentos da rematrícula",
          body: "Para a rematrícula, precisamos do comprovante de residência atualizado e da ficha de saúde.",
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
          "Primeiras semanas de aula",
          "Família de aluno novo recebe acompanhamento no começo.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. Como foram as primeiras semanas de aula? O aluno está se adaptando bem?",
          "{{primeiro_nome}}, se quiser conversar com a coordenação, eu marco um horário para vocês.",
          "Falar com {{nome}}: primeiras semanas sem resposta",
        ),
        followUp(
          "escola",
          "rematricula",
          "Rematrícula",
          "Rematrícula com antecedência.",
          { type: "manual" },
          "Oi, {{primeiro_nome}}. A rematrícula para o próximo ano já abriu. Posso te mandar as condições?",
          "{{primeiro_nome}}, a condição de rematrícula antecipada vale até o fim do mês.",
          "Falar com {{nome}}: rematrícula",
        ),
      ],
      agents: [
        {
          role: "sac",
          name: "Secretaria",
          goal: "Responder famílias sobre calendário, documentos, boletim e rematrícula.",
          instructions: `Converse com o responsável e confirme de qual aluno ele fala. Use a base com calendário, valores e regras da escola. ${AGENT_LIMITS}`,
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
