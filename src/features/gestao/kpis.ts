// Indicadores do gestor a partir das linhas semanais de gestao_trends: TMA, TME, resolução no
// primeiro contato (FCR), abandono, CSAT e NPS. Média ponderada pelo volume, nunca média de médias.
import type { TrendRow } from "./api";

export interface KpiSet {
  calls: number;
  tmaSeconds: number | null;
  tmeSeconds: number | null;
  abandonPct: number | null;
  fcrPct: number | null;
  tickets: number;
  ticketFrtSeconds: number | null;
  csat: number | null;
  csatN: number;
  nps: number | null;
  npsN: number;
}

interface Acc {
  calls: number;
  answered: number;
  abandoned: number;
  tmaSum: number;
  tmaN: number;
  tmeSum: number;
  tmeN: number;
  fcrOk: number;
  fcrBase: number;
  tickets: number;
  frtSum: number;
  frtN: number;
  csatSum: number;
  csatN: number;
  npsN: number;
  promoters: number;
  detractors: number;
}

const empty = (): Acc => ({
  calls: 0,
  answered: 0,
  abandoned: 0,
  tmaSum: 0,
  tmaN: 0,
  tmeSum: 0,
  tmeN: 0,
  fcrOk: 0,
  fcrBase: 0,
  tickets: 0,
  frtSum: 0,
  frtN: 0,
  csatSum: 0,
  csatN: 0,
  npsN: 0,
  promoters: 0,
  detractors: 0,
});

function add(a: Acc, r: TrendRow): Acc {
  const v = r.voice;
  const t = r.tickets;
  const n = r.nps;
  const out = { ...a };
  if (v) {
    out.calls += v.inbound;
    out.answered += v.answered;
    out.abandoned += v.abandoned;
    if (v.tma_seconds !== null) {
      out.tmaSum += v.tma_seconds * v.answered;
      out.tmaN += v.answered;
    }
    if (v.tme_seconds !== null) {
      out.tmeSum += v.tme_seconds * v.answered;
      out.tmeN += v.answered;
    }
    out.fcrOk += v.fcr_ok;
    out.fcrBase += v.fcr_base;
  }
  if (t) {
    out.tickets += t.created;
    if (t.frt_seconds !== null) {
      out.frtSum += t.frt_seconds * t.created;
      out.frtN += t.created;
    }
    if (t.csat_avg !== null && t.csat_n > 0) {
      out.csatSum += t.csat_avg * t.csat_n;
      out.csatN += t.csat_n;
    }
    out.fcrOk += t.fcr_ok;
    out.fcrBase += t.resolved;
  }
  if (n) {
    out.npsN += n.n;
    out.promoters += n.promoters;
    out.detractors += n.detractors;
  }
  return out;
}

function finish(a: Acc): KpiSet {
  const pct = (x: number, base: number) => (base > 0 ? Math.round((1000 * x) / base) / 10 : null);
  return {
    calls: a.calls,
    tmaSeconds: a.tmaN > 0 ? Math.round(a.tmaSum / a.tmaN) : null,
    tmeSeconds: a.tmeN > 0 ? Math.round(a.tmeSum / a.tmeN) : null,
    abandonPct: pct(a.abandoned, a.calls),
    fcrPct: pct(a.fcrOk, a.fcrBase),
    tickets: a.tickets,
    ticketFrtSeconds: a.frtN > 0 ? Math.round(a.frtSum / a.frtN) : null,
    csat: a.csatN > 0 ? Math.round((100 * a.csatSum) / a.csatN) / 100 : null,
    csatN: a.csatN,
    nps: a.npsN > 0 ? Math.round((100 * (a.promoters - a.detractors)) / a.npsN) : null,
    npsN: a.npsN,
  };
}

export function totals(rows: TrendRow[]): KpiSet {
  return finish(rows.reduce(add, empty()));
}

export function byWeek(rows: TrendRow[]): { week: string; kpis: KpiSet }[] {
  const m = new Map<string, Acc>();
  for (const r of rows) m.set(r.week, add(m.get(r.week) ?? empty(), r));
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, a]) => ({ week, kpis: finish(a) }));
}

export function byGroup(rows: TrendRow[]): { key: string; label: string; kpis: KpiSet }[] {
  const m = new Map<string, { label: string; acc: Acc }>();
  for (const r of rows) {
    if (r.group_key === "geral") continue; // NPS não tem equipe
    const cur = m.get(r.group_key) ?? { label: r.group_label, acc: empty() };
    m.set(r.group_key, { label: cur.label, acc: add(cur.acc, r) });
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, label: v.label, kpis: finish(v.acc) }))
    .sort((a, b) => b.kpis.calls + b.kpis.tickets - (a.kpis.calls + a.kpis.tickets));
}

/** Variação da última semana contra a anterior (null quando não dá para comparar). */
export function delta(series: (number | null)[]): number | null {
  const vals = series.filter((v): v is number => v !== null);
  if (vals.length < 2) return null;
  const last = vals[vals.length - 1]!;
  const prev = vals[vals.length - 2]!;
  return Math.round((last - prev) * 10) / 10;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h} h ${String(m).padStart(2, "0")}`;
}
