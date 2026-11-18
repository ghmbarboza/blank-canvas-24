// Saúde do cliente (customer success): nota de 0 a 100, risco de cancelamento e renovação.
// Explicável: começa em 100 e cada sinal ruim tira pontos com o motivo escrito; sinal bom devolve.

export interface HealthSignals {
  contact_id: string;
  name: string | null;
  company_name: string | null;
  owner_user_id: string | null;
  customer_since: string | null;
  last_interaction_at: string | null;
  inbound_30d: number;
  inbound_prev_30d: number;
  open_tickets: number;
  breached_tickets: number;
  csat_avg_90d: number | null;
  nps_last: number | null;
  overdue_payments: number;
  mrr: number;
  next_renewal_at: string | null;
  won_value_12m: number;
}

export type HealthLevel = "healthy" | "attention" | "risk";

export interface HealthFactor {
  label: string;
  points: number; // negativo tira, positivo devolve
}

export interface HealthResult {
  score: number;
  level: HealthLevel;
  churnRisk: "baixo" | "médio" | "alto";
  factors: HealthFactor[];
  renewal: { inDays: number | null; label: string };
  nextAction: string;
}

export const LEVEL_LABEL: Record<HealthLevel, string> = {
  healthy: "Saudável",
  attention: "Atenção",
  risk: "Em risco",
};

const DAY = 86_400_000;

function daysBetween(fromIso: string | null, now: number): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  return Number.isFinite(t) ? Math.floor((now - t) / DAY) : null;
}

export function scoreHealth(s: HealthSignals, now: number = Date.now()): HealthResult {
  const factors: HealthFactor[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) factors.push({ label, points });
  };

  const silent = daysBetween(s.last_interaction_at, now);
  if (silent === null) add("Nunca falou com a gente por nenhum canal", -20);
  else if (silent > 60) add(`Sem contato há ${silent} dias`, -25);
  else if (silent > 30) add(`Sem contato há ${silent} dias`, -12);

  if (s.inbound_prev_30d >= 4 && s.inbound_30d <= s.inbound_prev_30d / 3)
    add(
      `Conversa caiu de ${s.inbound_prev_30d} para ${s.inbound_30d} mensagens no último mês`,
      -10,
    );

  if (s.open_tickets >= 3) add(`${s.open_tickets} chamados abertos`, -15);
  else if (s.open_tickets > 0)
    add(
      `${s.open_tickets} chamado${s.open_tickets > 1 ? "s" : ""} aberto${s.open_tickets > 1 ? "s" : ""}`,
      -5,
    );
  if (s.breached_tickets > 0)
    add(`${s.breached_tickets} chamado(s) estouraram o prazo nos últimos 90 dias`, -10);

  if (s.csat_avg_90d !== null) {
    if (s.csat_avg_90d < 3) add(`Satisfação baixa (${fmt(s.csat_avg_90d)} de 5)`, -15);
    else if (s.csat_avg_90d >= 4.5) add(`Satisfação alta (${fmt(s.csat_avg_90d)} de 5)`, 5);
  }
  if (s.nps_last !== null) {
    if (s.nps_last <= 6) add(`Deu nota ${s.nps_last} no NPS (detrator)`, -20);
    else if (s.nps_last >= 9) add(`Deu nota ${s.nps_last} no NPS (promotor)`, 5);
  }
  if (s.overdue_payments > 0)
    add(`${s.overdue_payments} pagamento(s) em atraso`, s.overdue_payments > 1 ? -25 : -15);

  const renewalDays = s.next_renewal_at
    ? Math.ceil((Date.parse(`${s.next_renewal_at}T12:00:00Z`) - now) / DAY)
    : null;

  const raw = 100 + factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  const level: HealthLevel = score >= 80 ? "healthy" : score >= 60 ? "attention" : "risk";
  const nearRenewal = renewalDays !== null && renewalDays >= 0 && renewalDays <= 45;
  const churnRisk: HealthResult["churnRisk"] =
    level === "risk" || (level === "attention" && nearRenewal)
      ? "alto"
      : level === "attention"
        ? "médio"
        : "baixo";

  return {
    score,
    level,
    churnRisk,
    factors: factors.sort((a, b) => a.points - b.points),
    renewal: { inDays: renewalDays, label: renewalLabel(renewalDays) },
    nextAction: nextAction(level, factors, nearRenewal),
  };
}

function renewalLabel(days: number | null): string {
  if (days === null) return "Sem data de renovação";
  if (days < 0) return `Renovação venceu há ${-days} dias`;
  if (days === 0) return "Renova hoje";
  return `Renova em ${days} dias`;
}

function nextAction(level: HealthLevel, factors: HealthFactor[], nearRenewal: boolean): string {
  if (level === "healthy")
    return nearRenewal ? "Propor a renovação agora, enquanto está satisfeito" : "Manter o ritmo";
  const bad = factors.filter((f) => f.points < 0).map((f) => f.label);
  // Ordem de prioridade: dinheiro, insatisfação declarada, chamado, silêncio.
  if (bad.some((l) => l.includes("pagamento")))
    return "Falar com o financeiro do cliente sobre o atraso";
  if (bad.some((l) => l.includes("NPS") || l.includes("Satisfação")))
    return "Ligar para ouvir o que deu errado e combinar a correção";
  if (bad.some((l) => l.includes("chamado")))
    return "Resolver os chamados abertos antes de qualquer oferta";
  return "Retomar o contato com uma conversa de acompanhamento";
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export interface PortfolioSummary {
  total: number;
  healthy: number;
  attention: number;
  risk: number;
  mrrAtRisk: number;
  renewing45d: number;
}

export function portfolio(
  rows: { signals: HealthSignals; result: HealthResult }[],
): PortfolioSummary {
  const sum: PortfolioSummary = {
    total: rows.length,
    healthy: 0,
    attention: 0,
    risk: 0,
    mrrAtRisk: 0,
    renewing45d: 0,
  };
  for (const r of rows) {
    sum[r.result.level] += 1;
    if (r.result.churnRisk === "alto") sum.mrrAtRisk += r.signals.mrr;
    const d = r.result.renewal.inDays;
    if (d !== null && d >= 0 && d <= 45) sum.renewing45d += 1;
  }
  return sum;
}
