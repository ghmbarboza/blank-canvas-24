// Manchetes dos relatórios: frases curtas com número, montadas só com o que cada relatório já trouxe.
// Lógica pura (sem React) para poder testar cada frase.
import { formatMoney, formatNumber } from "@/lib/format";

import type {
  ActivityReport,
  AiReport,
  AttributionReport,
  ForecastReport,
  SalesReport,
} from "./api";
import type { OpsReport } from "./api-revenue";
import type { MrrSummary } from "./revenue";

// Trecho da frase: texto comum ou número em destaque.
export type Segment = string | { n: string };
export interface Headline {
  lead: Segment[];
  aside?: Segment[] | undefined;
}

const n = (v: string): Segment => ({ n: v });
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

export function salesHeadline(r: SalesReport): Headline {
  const t = r.totals;
  if (t.created === 0 && t.won === 0 && t.lost === 0)
    return {
      lead: ["Nenhum negócio foi criado ou fechado neste período."],
      aside: ["Quando um lead virar negócio no funil, a receita e a taxa de ganho aparecem aqui."],
    };
  const lead: Segment[] =
    t.won > 0
      ? [
          "A equipe ganhou ",
          n(formatNumber(t.won)),
          ` ${plural(t.won, "negócio", "negócios")} e `,
          n(formatMoney(t.won_value, true)),
          " no período",
        ]
      : [
          "Nenhum negócio foi ganho no período, mas ",
          n(formatNumber(t.created)),
          ` ${plural(t.created, "foi criado", "foram criados")}`,
        ];
  if (t.win_rate !== null) lead.push(", fechando ", n(`${t.win_rate}%`), " do que foi decidido.");
  else lead.push(".");
  const aside: Segment[] = [];
  if (t.won > 0) aside.push("Ticket médio de ", n(formatMoney(t.avg_ticket, true)));
  if (t.avg_cycle_days !== null)
    aside.push(
      aside.length ? "; cada venda levou " : "Cada venda levou ",
      n(`${t.avg_cycle_days} ${plural(t.avg_cycle_days, "dia", "dias")}`),
      " da criação ao ganho",
    );
  const topLoss = r.lost_reasons[0];
  if (topLoss && t.lost > 0)
    aside.push(
      aside.length ? ". " : "",
      "O motivo de perda mais comum foi “",
      topLoss.reason,
      "”, em ",
      n(`${pct(topLoss.count, t.lost)}%`),
      " das perdas",
    );
  return { lead, aside: aside.length ? [...aside, "."] : undefined };
}

export function forecastHeadline(r: ForecastReport): Headline {
  const cur = r.months[0];
  const committed = (cur?.won ?? 0) + (cur?.commit ?? 0);
  const best = (cur?.won ?? 0) + (cur?.best_case ?? 0);
  const weighted = cur?.weighted ?? 0;
  const lead: Segment[] =
    committed > 0
      ? [
          "Este mês deve fechar com ",
          n(formatMoney(committed, true)),
          " entre o que já foi ganho e o que os vendedores garantem",
          best > committed ? ", podendo chegar a " : ".",
        ]
      : weighted > 0
        ? [
            "Nada ganho nem garantido neste mês ainda. Pela probabilidade das etapas, o funil aponta ",
            n(formatMoney(weighted, true)),
            ".",
          ]
        : [
            "Ainda não há negócio previsto para este mês. Crie negócios com data de fechamento no Funil de vendas.",
          ];
  if (committed > 0 && best > committed) lead.push(n(formatMoney(best, true)), ".");
  const aside: Segment[] = [];
  if (r.overdue.deals > 0)
    aside.push(
      n(formatNumber(r.overdue.deals)),
      ` ${plural(r.overdue.deals, "negócio está", "negócios estão")} com a data de fechamento vencida (`,
      n(formatMoney(r.overdue.value, true)),
      "). Vale reprogramar.",
    );
  if (r.undated.deals > 0)
    aside.push(
      aside.length ? " " : "",
      n(formatNumber(r.undated.deals)),
      ` ${plural(r.undated.deals, "negócio aberto não tem", "negócios abertos não têm")} data prevista e ficam fora da conta.`,
    );
  return { lead, aside: aside.length ? aside : undefined };
}

export function mrrHeadline(s: MrrSummary, customers: number): Headline {
  const lead: Segment[] = [
    "A receita recorrente está em ",
    n(formatMoney(s.current, true)),
    " por mês, vinda de ",
    n(formatNumber(customers)),
    ` ${plural(customers, "cliente", "clientes")}.`,
  ];
  const aside: Segment[] = [];
  if (s.growthPct !== null)
    aside.push(
      s.growthPct >= 0 ? "Cresceu " : "Caiu ",
      n(`${Math.abs(s.growthPct)}%`),
      " no último mês",
    );
  if (s.churnPct !== null)
    aside.push(aside.length ? ", com churn de " : "O churn do mês foi de ", n(`${s.churnPct}%`));
  return { lead, aside: aside.length ? [...aside, "."] : undefined };
}

export function aiHeadline(r: AiReport): Headline {
  const { with_ai, without_human, rate } = r.resolution;
  const calls = r.llm_monthly.reduce((s, m) => s + m.calls, 0);
  const errors = r.llm_monthly.reduce((s, m) => s + m.errors, 0);
  if (with_ai === 0 && calls === 0)
    return {
      lead: ["A IA ainda não atendeu nenhuma conversa nos últimos 6 meses."],
      aside: ["Ligue um agente de IA em um canal para ver aqui quanto ele resolve sozinho."],
    };
  const lead: Segment[] =
    rate !== null && with_ai > 0
      ? [
          "A IA resolveu ",
          n(`${rate}%`),
          " das conversas em que entrou sem passar para a equipe: ",
          n(formatNumber(without_human)),
          ` de ${formatNumber(with_ai)}.`,
        ]
      : ["A IA foi chamada ", n(formatNumber(calls)), " vezes nos últimos 6 meses."];
  const aside: Segment[] = [
    "Nos últimos 6 meses foram ",
    n(formatNumber(calls)),
    ` ${plural(calls, "chamada", "chamadas")} à IA`,
  ];
  if (calls > 0)
    aside.push(
      ", com ",
      n(`${((100 * errors) / calls).toFixed(1).replace(".", ",")}%`),
      " de erro",
    );
  return { lead, aside: [...aside, "."] };
}

export function attributionHeadline(r: AttributionReport, label: (s: string) => string): Headline {
  const leads = r.first_touch.reduce((s, x) => s + x.leads, 0);
  const top = [...r.first_touch].sort((a, b) => b.leads - a.leads)[0];
  const lead: Segment[] = top
    ? [
        cap(label(top.source)),
        " trouxe ",
        n(`${pct(top.leads, leads)}%`),
        " dos ",
        n(formatNumber(leads)),
        ` ${plural(leads, "lead", "leads")} do período.`,
      ]
    : ["Nenhum lead novo entrou no período."];
  const closer = [...r.last_touch].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0];
  const aside: Segment[] | undefined =
    closer && Number(closer.revenue) > 0
      ? [
          "A origem que mais fechou venda foi ",
          label(closer.source),
          ", com ",
          n(formatMoney(Number(closer.revenue), true)),
          ` em ${formatNumber(closer.deals)} ${plural(closer.deals, "negócio", "negócios")}.`,
        ]
      : undefined;
  return { lead, aside };
}

export function serviceHeadline(d: Record<string, unknown>): Headline {
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  const created = num("created") ?? 0;
  const resolved = num("resolved");
  const sla = num("sla_met_pct");
  const lead: Segment[] =
    created > 0
      ? [
          n(formatNumber(created)),
          ` ${plural(created, "chamado foi aberto", "chamados foram abertos")} no período`,
        ]
      : ["Nenhum chamado foi aberto no período"];
  if (created > 0 && resolved !== null)
    lead.push(
      " e ",
      n(formatNumber(resolved)),
      ` ${plural(resolved, "foi resolvido", "foram resolvidos")}`,
    );
  if (sla !== null) lead.push(", ", n(`${Math.round(sla)}%`), " dentro do prazo combinado");
  lead.push(".");
  const aside: Segment[] = [];
  const first = num("first_response_minutes_avg");
  if (first !== null)
    aside.push("A primeira resposta saiu em média em ", n(`${Math.round(first)} min`));
  const aiReplied = num("ai_replied");
  const handoff = num("ai_handoff");
  if (aiReplied !== null && aiReplied > 0) {
    aside.push(aside.length ? ". " : "", "A IA respondeu ", n(formatNumber(aiReplied)));
    if (handoff !== null) aside.push(" e passou ", n(formatNumber(handoff)), " para a equipe");
  }
  const breached = num("breached_open");
  if (breached !== null && breached > 0)
    aside.push(
      aside.length ? ". " : "",
      n(formatNumber(breached)),
      ` ${plural(breached, "chamado aberto já passou", "chamados abertos já passaram")} do prazo`,
    );
  return { lead, aside: aside.length ? [...aside, "."] : undefined };
}

const ANSWERED = new Set(["completed", "answered", "ended"]);

export function activityHeadline(d: ActivityReport, kind: "calls" | "meetings"): Headline {
  const noun = kind === "calls" ? ["ligação", "ligações"] : ["reunião", "reuniões"];
  if (d.total === 0)
    return {
      lead: [`Nenhuma ${noun[0]} no período.`],
      aside: undefined,
    };
  const lead: Segment[] = [
    n(formatNumber(d.total)),
    ` ${plural(d.total, noun[0]!, noun[1]!)} no período`,
  ];
  if (d.avg_minutes !== null) lead.push(", com duração média de ", n(`${d.avg_minutes} min`));
  lead.push(".");
  const statuses = Object.entries(d.by_status).filter(([k]) => k !== "-");
  const ok = statuses.filter(([k]) => ANSWERED.has(k)).reduce((s, [, v]) => s + Number(v), 0);
  const noShow = Number(d.by_status["no_show"] ?? 0);
  let aside: Segment[] | undefined;
  if (kind === "calls" && statuses.length > 0)
    aside = [
      n(`${pct(ok, d.total)}%`),
      " foram atendidas. Ao todo, ",
      n(formatNumber(d.total_minutes)),
      " minutos em linha.",
    ];
  if (kind === "meetings" && noShow > 0)
    aside = [
      "Em ",
      n(formatNumber(noShow)),
      ` ${plural(noShow, "reunião", "reuniões")} a pessoa não compareceu (`,
      n(`${pct(noShow, d.total)}%`),
      ").",
    ];
  return { lead, aside };
}

export function opsHeadline(s: OpsReport["service"]): Headline {
  if (s.inbound === 0)
    return {
      lead: ["Nenhuma ligação recebida no período."],
      aside: ["Com a telefonia ligada, o nível de serviço e a ocupação da equipe aparecem aqui."],
    };
  const lead: Segment[] =
    s.service_level !== null
      ? [
          n(`${s.service_level}%`),
          ` das ligações recebidas foram atendidas em até ${s.sla_seconds} segundos.`,
        ]
      : [
          n(formatNumber(s.answered)),
          ` de ${formatNumber(s.inbound)} ligações recebidas foram atendidas.`,
        ];
  const aside: Segment[] = [];
  if (s.abandoned > 0)
    aside.push(
      n(formatNumber(s.abandoned)),
      ` ${plural(s.abandoned, "pessoa desistiu", "pessoas desistiram")} antes de ser atendida (`,
      n(`${pct(s.abandoned, s.inbound)}%`),
      ")",
    );
  if (s.avg_wait_seconds !== null)
    aside.push(aside.length ? ". " : "", "A espera média foi de ", n(`${s.avg_wait_seconds} s`));
  return { lead, aside: aside.length ? [...aside, "."] : undefined };
}
