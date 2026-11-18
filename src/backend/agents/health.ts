// Saúde do cliente (0 a 100), pura: chamados abertos, satisfação, cobrança vencida e silêncio.
export interface HealthInput {
  openTickets: number;
  urgentTickets: number;
  avgCsat: number | null; // 1 a 5
  lastNps: number | null; // 0 a 10
  overduePayments: number;
  daysSinceLastContact: number | null;
}

export function healthScore(h: HealthInput): {
  score: number;
  level: "bom" | "atenção" | "risco";
  reasons: string[];
} {
  let score = 100;
  const reasons: string[] = [];
  if (h.openTickets > 0) {
    score -= Math.min(30, h.openTickets * 8 + h.urgentTickets * 7);
    reasons.push(`${h.openTickets} chamado(s) aberto(s)`);
  }
  if (h.avgCsat !== null && h.avgCsat < 4) {
    score -= Math.round((4 - h.avgCsat) * 10);
    reasons.push(`satisfação média ${h.avgCsat.toFixed(1)} de 5`);
  }
  if (h.lastNps !== null && h.lastNps <= 6) {
    score -= 15;
    reasons.push(`última nota de recomendação ${h.lastNps}`);
  }
  if (h.overduePayments > 0) {
    score -= Math.min(25, h.overduePayments * 12);
    reasons.push(`${h.overduePayments} cobrança(s) vencida(s)`);
  }
  if (h.daysSinceLastContact !== null && h.daysSinceLastContact > 30) {
    score -= Math.min(20, Math.round((h.daysSinceLastContact - 30) / 3));
    reasons.push(`${h.daysSinceLastContact} dias sem conversar`);
  }
  const s = Math.max(0, Math.min(100, score));
  return { score: s, level: s >= 70 ? "bom" : s >= 45 ? "atenção" : "risco", reasons };
}
