// Contas puras dos painéis de receita recorrente e de operação (testadas em revenue.test.ts).

export interface MrrMonth {
  month: string;
  mrr: number;
  new: number;
  expansion: number;
  contraction: number;
  churn: number;
}

export interface MrrSummary {
  current: number;
  arr: number;
  netNew: number;
  growthPct: number | null;
  churnPct: number | null;
}

/** Resumo do mês corrente: ARR, MRR novo líquido, crescimento e churn sobre o MRR do mês anterior. */
export function mrrSummary(current: number, months: MrrMonth[]): MrrSummary {
  const last = months[months.length - 1];
  const prev = months[months.length - 2];
  const netNew = last ? last.new + last.expansion - last.contraction - last.churn : 0;
  const base = prev ? Number(prev.mrr) : 0;
  return {
    current,
    arr: current * 12,
    netNew,
    growthPct: base > 0 ? round1(((current - base) / base) * 100) : null,
    churnPct: base > 0 && last ? round1(((last.churn + last.contraction) / base) * 100) : null,
  };
}

export interface NpsCounts {
  promoters: number;
  passives: number;
  detractors: number;
}

/** NPS = % promotores − % detratores (−100 a 100); null sem respostas. */
export function npsScore(c: NpsCounts): number | null {
  const total = c.promoters + c.passives + c.detractors;
  if (!total) return null;
  return Math.round(((c.promoters - c.detractors) / total) * 100);
}

/** Custo por unidade; null quando não há unidades (evita "R$ 0" enganoso). */
export function perUnit(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

export interface ChannelLeads {
  channel: string;
  leads: number;
  spend: number | null;
}

export interface CplRow extends ChannelLeads {
  cpl: number | null;
}

/** Custo por lead por canal (verba ÷ leads do primeiro toque) e o total dos canais com verba. */
export function costPerLead(rows: ChannelLeads[]): { rows: CplRow[]; total: CplRow } {
  const out = rows.map((r) => ({
    ...r,
    spend: r.spend === null ? null : Number(r.spend),
    cpl: r.spend === null ? null : perUnit(Number(r.spend), r.leads),
  }));
  const paid = out.filter((r) => r.spend !== null);
  const spend = paid.reduce((s, r) => s + (r.spend ?? 0), 0);
  const leads = paid.reduce((s, r) => s + r.leads, 0);
  return {
    rows: out,
    total: { channel: "Total com verba", leads, spend, cpl: perUnit(spend, leads) },
  };
}

/** "2026-10" do primeiro dia do mês, para a tabela ad_spend. */
export function monthStart(ym: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new Error("Mês inválido");
  return `${ym}-01`;
}

/** Valor digitado ("1.234,56", "1234.5") para número; null se não for número válido ≥ 0. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  const thousands = /^\d{1,3}(\.\d{3})+$/.test(s); // "1.234" é mil duzentos e trinta e quatro
  const normalized = s.includes(",") || thousands ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
