import { describe, expect, it } from "vitest";

import { healthScore } from "./health";

const ok = {
  openTickets: 0,
  urgentTickets: 0,
  avgCsat: null,
  lastNps: null,
  overduePayments: 0,
  daysSinceLastContact: 3,
};

describe("healthScore", () => {
  it("cliente sem problema é bom", () => {
    expect(healthScore(ok)).toEqual({ score: 100, level: "bom", reasons: [] });
  });
  it("chamado urgente, nota baixa e cobrança vencida viram risco com motivos", () => {
    const h = healthScore({
      ...ok,
      openTickets: 2,
      urgentTickets: 1,
      lastNps: 4,
      overduePayments: 2,
    });
    expect(h.level).toBe("risco");
    expect(h.reasons).toHaveLength(3);
  });
  it("nunca sai de 0 a 100", () => {
    const h = healthScore({
      ...ok,
      openTickets: 50,
      urgentTickets: 50,
      avgCsat: 1,
      lastNps: 0,
      overduePayments: 9,
      daysSinceLastContact: 400,
    });
    expect(h.score).toBe(0);
  });
});
