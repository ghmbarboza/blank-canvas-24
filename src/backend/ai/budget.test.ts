import { describe, expect, it } from "vitest";

import {
  DEFAULT_MONTHLY_AI_BUDGET_USD,
  MAX_MONTHLY_AI_BUDGET_USD,
  budgetMessage,
  monthlyBudget,
  overBudget,
} from "./budget";

describe("teto mensal de IA (R9)", () => {
  it("usa o padrão quando a conta não definiu teto", () => {
    expect(monthlyBudget(undefined)).toBe(DEFAULT_MONTHLY_AI_BUDGET_USD);
    expect(monthlyBudget({})).toBe(DEFAULT_MONTHLY_AI_BUDGET_USD);
    expect(monthlyBudget({ ai_budget: null })).toBe(DEFAULT_MONTHLY_AI_BUDGET_USD);
  });

  it("aceita o teto da conta, inclusive zero (IA desligada)", () => {
    expect(monthlyBudget({ ai_budget: { monthly_usd: 30 } })).toBe(30);
    expect(monthlyBudget({ ai_budget: { monthly_usd: "45.5" } })).toBe(45.5);
    expect(monthlyBudget({ ai_budget: { monthly_usd: 0 } })).toBe(0);
  });

  it("ignora valor inválido ou negativo e limita valor absurdo", () => {
    expect(monthlyBudget({ ai_budget: { monthly_usd: -5 } })).toBe(DEFAULT_MONTHLY_AI_BUDGET_USD);
    expect(monthlyBudget({ ai_budget: { monthly_usd: "abc" } })).toBe(
      DEFAULT_MONTHLY_AI_BUDGET_USD,
    );
    expect(monthlyBudget({ ai_budget: { monthly_usd: 1e12 } })).toBe(MAX_MONTHLY_AI_BUDGET_USD);
  });

  it("corta ao atingir o teto, não antes", () => {
    expect(overBudget(99.99, 100)).toBe(false);
    expect(overBudget(100, 100)).toBe(true);
    expect(overBudget(0, 0)).toBe(true);
  });

  it("explica o corte e onde mudar", () => {
    expect(budgetMessage(30)).toContain("US$ 30.00");
    expect(budgetMessage(30)).toContain("Ajustes");
  });
});
