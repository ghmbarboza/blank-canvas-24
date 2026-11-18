// "Pergunte à Central de CS", parte pura: as ferramentas de leitura que o modelo pode usar. Cada uma
// mapeia para uma RPC agregada que já existe (relatórios e painéis), chamada com a sessão do
// gestor (RLS vale). Nada de SQL livre: o modelo só escolhe a ferramenta e o período.
import type { ToolSpec } from "./tool-loop";

export interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

const days = (d: string) => ({ type: "number", description: d });
const date = (d: string) => ({ type: "string", description: `${d} (YYYY-MM-DD)` });

interface ReadTool {
  spec: ToolSpec;
  rpc: (accountId: string, a: Record<string, unknown>, today: string) => RpcCall;
}

export function clampInt(v: unknown, min: number, max: number, d: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Período seguro: datas válidas, de no máximo 366 dias, padrão últimos 30 dias até hoje. */
export function period(a: Record<string, unknown>, today: string): { from: string; to: string } {
  const to = typeof a["to"] === "string" && ISO.test(a["to"]) ? (a["to"] as string) : today;
  const toD = new Date(`${to}T12:00:00Z`);
  const def = new Date(toD.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  let from = typeof a["from"] === "string" && ISO.test(a["from"]) ? (a["from"] as string) : def;
  if (from > to) from = to;
  const minFrom = new Date(toD.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  if (from < minFrom) from = minFrom;
  return { from, to };
}

const periodParams = {
  type: "object",
  properties: { from: date("Início"), to: date("Fim") },
};

export const READ_TOOLS: Record<string, ReadTool> = {
  painel_gerencial: {
    spec: {
      name: "painel_gerencial",
      description:
        "Números gerais da operação nos últimos N dias: conversas, leads, negócios, tempo de resposta, por atendente.",
      parameters: { type: "object", properties: { days: days("Dias para trás, 1 a 90") } },
    },
    rpc: (acc, a) => ({
      fn: "dashboard_gerencial",
      args: { _account: acc, _days: clampInt(a["days"], 1, 90, 30) },
    }),
  },
  atendimento_sac: {
    spec: {
      name: "atendimento_sac",
      description:
        "Chamados do SAC nos últimos N dias: abertos, resolvidos, SLA, CSAT, NPS e respostas da IA.",
      parameters: { type: "object", properties: { days: days("Dias para trás, 1 a 365") } },
    },
    rpc: (acc, a) => ({
      fn: "sac_metrics",
      args: { _account: acc, _days: clampInt(a["days"], 1, 365, 30) },
    }),
  },
  relatorio_atendimento: {
    spec: {
      name: "relatorio_atendimento",
      description: "Relatório de atendimento num período: volume, tempos e resultado por canal.",
      parameters: periodParams,
    },
    rpc: (acc, a, today) => {
      const p = period(a, today);
      return { fn: "report_service", args: { _account: acc, _from: p.from, _to: p.to } };
    },
  },
  relatorio_operacao: {
    spec: {
      name: "relatorio_operacao",
      description:
        "Operação do call center num período: ligações recebidas, atendidas, perdidas, espera, ocupação.",
      parameters: periodParams,
    },
    rpc: (acc, a, today) => {
      const p = period(a, today);
      return { fn: "report_ops", args: { _account: acc, _from: p.from, _to: p.to } };
    },
  },
  relatorio_vendas: {
    spec: {
      name: "relatorio_vendas",
      description: "Vendas num período: negócios criados, ganhos, perdidos, valor e conversão.",
      parameters: periodParams,
    },
    rpc: (acc, a, today) => {
      const p = period(a, today);
      return { fn: "report_sales", args: { _account: acc, _from: p.from, _to: p.to } };
    },
  },
  previsao_vendas: {
    spec: {
      name: "previsao_vendas",
      description: "Previsão de receita dos próximos meses pelo funil.",
      parameters: { type: "object", properties: { months: days("Meses, 1 a 12") } },
    },
    rpc: (acc, a) => ({
      fn: "report_forecast",
      args: { _account: acc, _months: clampInt(a["months"], 1, 12, 3) },
    }),
  },
  relatorio_ia: {
    spec: {
      name: "relatorio_ia",
      description: "Uso e custo da IA por mês: respostas, passagens para humano, gasto.",
      parameters: { type: "object", properties: { months: days("Meses, 1 a 12") } },
    },
    rpc: (acc, a) => ({
      fn: "report_ai",
      args: { _account: acc, _months: clampInt(a["months"], 1, 12, 3) },
    }),
  },
  fila_ao_vivo: {
    spec: {
      name: "fila_ao_vivo",
      description: "Fila de ligações agora: em espera, em atendimento, atendentes livres, hoje.",
      parameters: { type: "object", properties: {} },
    },
    rpc: (acc) => ({ fn: "call_center_stats", args: { _account: acc } }),
  },
  equipe_ia: {
    spec: {
      name: "equipe_ia",
      description:
        "Equipe de agentes de IA nos últimos N dias: respostas e passagens por agente, alertas do supervisor e conversas caladas.",
      parameters: { type: "object", properties: { days: days("Dias, 1 a 90") } },
    },
    rpc: (acc, a) => ({
      fn: "agents_overview",
      args: { _account: acc, _days: clampInt(a["days"], 1, 90, 7) },
    }),
  },
};

export interface ConversationQuery {
  text: string | null;
  from: string;
  to: string;
  status: "open" | "pending" | "closed" | "any";
  unanswered: boolean;
}

/** Busca de conversas com filtros fixos (texto, período, situação). Sem SQL livre. */
export function conversationQuery(a: Record<string, unknown>, today: string): ConversationQuery {
  const p = period(a, today);
  const st = a["status"];
  const text =
    typeof a["text"] === "string"
      ? a["text"]
          .replace(/[%_,()]/g, " ")
          .trim()
          .slice(0, 80)
      : "";
  return {
    text: text || null,
    from: p.from,
    to: p.to,
    status: st === "open" || st === "pending" || st === "closed" ? st : "any",
    unanswered: a["unanswered"] === true,
  };
}

export const SEARCH_CONVERSATIONS: ToolSpec = {
  name: "buscar_conversas",
  description:
    "Procura conversas por palavra (ex.: entrega, reclamação), período e situação. Devolve quantas e as 20 mais recentes com link.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Palavra ou trecho" },
      from: date("Início"),
      to: date("Fim"),
      status: { type: "string", enum: ["open", "pending", "closed", "any"] },
      unanswered: { type: "boolean", description: "Só as que esperam resposta" },
    },
  },
};

export const CREATE_AGENT: ToolSpec = {
  name: "criar_agente",
  description:
    "Quando o gestor pede para criar um agente de IA (ex.: cria um agente de cobrança que oferece até 3x). Monta o agente em rascunho e a suíte de avaliação.",
  parameters: {
    type: "object",
    properties: { description: { type: "string", description: "O pedido do gestor, completo" } },
    required: ["description"],
  },
};

export const ANSWER: ToolSpec = {
  name: "responder",
  description: "Resposta final ao gestor, com número e fonte. Termina.",
  parameters: {
    type: "object",
    properties: {
      answer: { type: "string", description: "Resposta curta com os números e de onde vieram" },
      links: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, href: { type: "string" } },
          required: ["label", "href"],
        },
      },
    },
    required: ["answer"],
  },
};

export function askTools(canCreateAgent: boolean): ToolSpec[] {
  return [
    ...Object.values(READ_TOOLS).map((t) => t.spec),
    SEARCH_CONVERSATIONS,
    ...(canCreateAgent ? [CREATE_AGENT] : []),
    ANSWER,
  ];
}

export function askSystem(company: string, today: string): string {
  return [
    `Você é o "Pergunte à Central de CS", analista da operação da empresa ${company}. Hoje é ${today}.`,
    "Responda só com dados das ferramentas. Toda resposta tem número e diz de onde veio (qual relatório e período).",
    "Se nenhuma ferramenta tem o dado, diga isso claramente e onde ele não foi encontrado; não estime.",
    "Para listar casos, use buscar_conversas e inclua os links (href começando por /inbox/).",
    "Português direto, sem exclamação, sem emoji. No fim chame responder.",
  ].join(" ");
}

/** Só links internos do app vão para a tela. */
export function safeLinks(raw: unknown): { label: string; href: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => l as { label?: unknown; href?: unknown })
    .filter((l) => typeof l.href === "string" && /^\/[a-z0-9/_?=&.-]*$/i.test(l.href))
    .map((l) => ({ label: String(l.label ?? l.href).slice(0, 120), href: String(l.href) }))
    .slice(0, 30);
}
