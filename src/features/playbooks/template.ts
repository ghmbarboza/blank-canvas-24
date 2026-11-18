import type { PlaybookContent, ScorecardCriterion } from "./types";

// Modelo pronto: venda consultiva B2B com BANT. O gestor duplica e ajusta ao próprio negócio.
export const TEMPLATE_PLAYBOOK: PlaybookContent = {
  name: "Venda consultiva (modelo)",
  description: "Roteiro de reunião de diagnóstico e proposta, com qualificação BANT.",
  framework: "BANT",
  phases: [
    {
      id: "abertura",
      name: "Abertura",
      items: [
        {
          id: "agenda",
          label: "Combinar a pauta e o tempo da conversa",
          required: true,
          keywords: ["pauta", "agenda", "nossos minutos", "o que vamos ver"],
        },
        {
          id: "gravacao",
          label: "Avisar que a reunião é gravada",
          required: true,
          keywords: ["gravando", "gravada", "gravação"],
        },
      ],
    },
    {
      id: "descoberta",
      name: "Descoberta",
      items: [
        {
          id: "dor",
          label: "Entender a dor principal",
          required: true,
          keywords: ["qual o maior desafio", "o que te trouxe", "problema", "dor"],
        },
        {
          id: "impacto",
          label: "Medir o impacto da dor (tempo, dinheiro)",
          required: true,
          keywords: ["quanto custa", "impacto", "quanto tempo", "quanto vocês perdem"],
        },
        {
          id: "orcamento",
          label: "Perguntar sobre orçamento",
          required: true,
          keywords: ["orçamento", "investimento", "quanto pretendem investir", "budget"],
        },
        {
          id: "decisor",
          label: "Descobrir quem decide",
          required: true,
          keywords: ["quem decide", "quem mais participa", "aprovação", "decisor"],
        },
        {
          id: "prazo",
          label: "Combinar o prazo da decisão",
          required: true,
          keywords: ["prazo", "até quando", "quando precisam", "data"],
        },
      ],
    },
    {
      id: "apresentacao",
      name: "Apresentação",
      items: [
        {
          id: "ligar_dor",
          label: "Ligar a solução à dor que o cliente falou",
          required: false,
          keywords: ["você comentou", "como você disse", "isso resolve"],
        },
        {
          id: "caso",
          label: "Mostrar um caso parecido",
          required: false,
          keywords: ["um cliente", "caso", "case"],
        },
      ],
    },
    {
      id: "fechamento",
      name: "Fechamento",
      items: [
        {
          id: "proximo_passo",
          label: "Marcar o próximo passo com data",
          required: true,
          keywords: ["próximo passo", "na próxima", "vamos marcar", "te mando a proposta"],
        },
      ],
    },
  ],
  questions: [
    {
      id: "q-budget",
      label: "Vocês já têm um valor reservado para resolver isso?",
      field: "budget",
    },
    { id: "q-authority", label: "Além de você, quem participa da decisão?", field: "authority" },
    { id: "q-need", label: "O que acontece se nada mudar nos próximos 6 meses?", field: "need" },
    { id: "q-timeline", label: "Até quando vocês precisam disso funcionando?", field: "timeline" },
  ],
  objections: [
    {
      id: "caro",
      label: "Está caro",
      triggers: ["caro", "muito caro", "fora do orçamento", "preço alto", "não cabe"],
      answer:
        "Entendo. Comparado com o quê? Vamos voltar ao custo do problema que você me contou e ver quanto tempo leva para se pagar.",
      proof: "Clientes do mesmo porte recuperam o investimento em média em 4 meses.",
    },
    {
      id: "pensar",
      label: "Vou pensar",
      triggers: ["vou pensar", "preciso pensar", "deixa eu ver", "te retorno"],
      answer:
        "Claro. Para eu te ajudar a pensar: o que ainda não ficou claro, o valor, o prazo ou se resolve mesmo o problema?",
    },
    {
      id: "momento",
      label: "Não é o momento",
      triggers: ["não é o momento", "agora não", "ano que vem", "mais pra frente"],
      answer:
        "Faz sentido. O que precisa acontecer para virar prioridade? Posso deixar um plano pronto para quando chegar a hora.",
    },
  ],
  competitors: [
    {
      id: "planilha",
      name: "Planilha / fazer na mão",
      triggers: ["planilha", "excel", "fazemos na mão"],
      arguments: [
        "A planilha não avisa quando o lead esfria.",
        "Ninguém sabe quem respondeu o quê.",
        "O custo é o tempo da equipe.",
      ],
    },
  ],
  closing_signals: [
    {
      id: "como_funciona_contratacao",
      label: "Perguntou como contratar",
      triggers: [
        "como funciona a contratação",
        "como a gente começa",
        "qual o próximo passo",
        "manda a proposta",
      ],
      proposal: "Sinal de compra: proponha a data de início e envie a proposta ainda hoje.",
    },
    {
      id: "prazo_implantacao",
      label: "Perguntou prazo de implantação",
      triggers: ["quanto tempo para implantar", "em quanto tempo", "quando fica pronto"],
      proposal: "Responda o prazo e já ofereça reservar a data de início.",
    },
  ],
  forbidden_phrases: [
    "garanto resultado",
    "100% garantido",
    "sem risco nenhum",
    "não tem como dar errado",
  ],
};

export const TEMPLATE_SCORECARD: { name: string; criteria: ScorecardCriterion[] } = {
  name: "Reunião de vendas (modelo)",
  criteria: [
    {
      id: "abertura",
      label: "Abertura e pauta",
      description: "Combinou pauta, tempo e avisou da gravação",
      weight: 1,
    },
    {
      id: "descoberta",
      label: "Descoberta",
      description: "Entendeu dor e impacto com perguntas abertas",
      weight: 3,
    },
    {
      id: "qualificacao",
      label: "Qualificação",
      description: "Cobriu orçamento, decisor e prazo",
      weight: 3,
    },
    {
      id: "objecoes",
      label: "Objeções",
      description: "Tratou objeções com pergunta e prova",
      weight: 2,
    },
    {
      id: "proximo_passo",
      label: "Próximo passo",
      description: "Saiu com próximo passo e data",
      weight: 2,
    },
    {
      id: "escuta",
      label: "Escuta",
      description: "Deixou o cliente falar (vendedor abaixo de 60% do tempo)",
      weight: 1,
    },
  ],
};
