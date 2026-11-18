import { describe, expect, it } from "vitest";

import { costPerLead, monthStart, mrrSummary, npsScore, parseAmount, perUnit } from "./revenue";

describe("mrrSummary", () => {
  it("calcula ARR, MRR novo líquido, crescimento e churn sobre o mês anterior", () => {
    const s = mrrSummary(2500, [
      { month: "2026-09", mrr: 2000, new: 0, expansion: 0, contraction: 0, churn: 0 },
      { month: "2026-10", mrr: 2500, new: 800, expansion: 200, contraction: 100, churn: 400 },
    ]);
    expect(s).toEqual({ current: 2500, arr: 30000, netNew: 500, growthPct: 25, churnPct: 25 });
  });
  it("sem mês anterior não inventa porcentagem", () => {
    const s = mrrSummary(1000, [
      { month: "2026-10", mrr: 1000, new: 1000, expansion: 0, contraction: 0, churn: 0 },
    ]);
    expect(s.growthPct).toBeNull();
    expect(s.churnPct).toBeNull();
    expect(mrrSummary(0, []).netNew).toBe(0);
  });
});

describe("npsScore", () => {
  it("promotores menos detratores sobre o total", () => {
    expect(npsScore({ promoters: 6, passives: 2, detractors: 2 })).toBe(40);
    expect(npsScore({ promoters: 0, passives: 0, detractors: 3 })).toBe(-100);
    expect(npsScore({ promoters: 0, passives: 0, detractors: 0 })).toBeNull();
  });
});

describe("custo por unidade e por lead", () => {
  it("perUnit não divide por zero", () => {
    expect(perUnit(10, 4)).toBe(2.5);
    expect(perUnit(10, 0)).toBeNull();
  });
  it("custo por lead só nos canais com verba, com total", () => {
    const r = costPerLead([
      { channel: "google", leads: 10, spend: 500 },
      { channel: "meta", leads: 0, spend: 200 },
      { channel: "direto", leads: 30, spend: null },
    ]);
    expect(r.rows.map((x) => x.cpl)).toEqual([50, null, null]);
    expect(r.total).toEqual({ channel: "Total com verba", leads: 10, spend: 700, cpl: 70 });
  });
});

describe("entrada da verba", () => {
  it("mês vira o primeiro dia", () => {
    expect(monthStart("2026-10")).toBe("2026-10-01");
    expect(() => monthStart("2026-13")).toThrow();
  });
  it("aceita valor brasileiro e recusa lixo", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("R$ 800")).toBe(800);
    expect(parseAmount("99.5")).toBe(99.5);
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});
