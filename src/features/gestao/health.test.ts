import { describe, expect, it } from "vitest";

import { portfolio, scoreHealth, type HealthSignals } from "./health";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const base: HealthSignals = {
  contact_id: "c1",
  name: "Cliente",
  company_name: null,
  owner_user_id: null,
  customer_since: "2025-01-01T00:00:00Z",
  last_interaction_at: "2026-10-20T00:00:00Z",
  inbound_30d: 5,
  inbound_prev_30d: 5,
  open_tickets: 0,
  breached_tickets: 0,
  csat_avg_90d: null,
  nps_last: null,
  overdue_payments: 0,
  mrr: 1000,
  next_renewal_at: null,
  won_value_12m: 0,
};

describe("saúde do cliente", () => {
  it("cliente ativo sem problema é saudável", () => {
    const r = scoreHealth(base, NOW);
    expect(r.score).toBe(100);
    expect(r.level).toBe("healthy");
    expect(r.churnRisk).toBe("baixo");
    expect(r.factors).toEqual([]);
  });

  it("cada motivo aparece com os pontos", () => {
    const r = scoreHealth(
      { ...base, last_interaction_at: "2026-08-01T00:00:00Z", overdue_payments: 2, nps_last: 4 },
      NOW,
    );
    expect(r.score).toBe(100 - 25 - 25 - 20);
    expect(r.level).toBe("risk");
    expect(r.churnRisk).toBe("alto");
    expect(r.factors[0]?.points).toBe(-25);
    expect(r.factors.map((f) => f.label).join(" ")).toContain("NPS");
    expect(r.nextAction).toContain("financeiro");
  });

  it("queda de conversa é sinal de risco", () => {
    const r = scoreHealth({ ...base, inbound_prev_30d: 12, inbound_30d: 2 }, NOW);
    expect(r.factors[0]?.label).toContain("caiu de 12 para 2");
  });

  it("atenção perto da renovação vira risco alto", () => {
    const r = scoreHealth(
      { ...base, open_tickets: 3, breached_tickets: 1, next_renewal_at: "2026-11-15" },
      NOW,
    );
    expect(r.level).toBe("attention");
    expect(r.churnRisk).toBe("alto");
    expect(r.renewal.inDays).toBe(19);
    expect(r.renewal.label).toBe("Renova em 19 dias");
  });

  it("promotor e satisfação alta somam, mas a nota não passa de 100", () => {
    expect(scoreHealth({ ...base, nps_last: 10, csat_avg_90d: 4.8 }, NOW).score).toBe(100);
  });

  it("resumo da carteira soma receita em risco", () => {
    const rows = [base, { ...base, overdue_payments: 2, nps_last: 3, mrr: 500 }].map((s) => ({
      signals: s,
      result: scoreHealth(s, NOW),
    }));
    const p = portfolio(rows);
    expect(p).toMatchObject({ total: 2, healthy: 1, risk: 1, mrrAtRisk: 500 });
  });
});
