import { describe, expect, it } from "vitest";

import { formatDocument, isValidCpf, proposalTotals } from "./totals";

describe("totais da proposta", () => {
  it("separa avulso, mensal e anual; mensal conta 12 meses no total", () => {
    const t = proposalTotals([
      {
        name: "Plano",
        quantity: 1,
        unit_price: 100,
        discount_pct: 10,
        billing: "monthly",
        line_period: 90,
        line_total: 1080,
      },
      {
        name: "Setup",
        quantity: 1,
        unit_price: 200,
        discount_pct: 0,
        billing: "one_time",
        line_period: 200,
        line_total: 200,
      },
      {
        name: "Suporte",
        quantity: 1,
        unit_price: 500,
        discount_pct: 0,
        billing: "yearly",
        line_period: 500,
        line_total: 500,
      },
    ]);
    expect(t).toEqual({ oneTime: 200, monthly: 90, yearly: 500, discount: 120, total: 1780 });
  });
  it("lista vazia dá zero", () => {
    expect(proposalTotals([]).total).toBe(0);
  });
});

describe("documento", () => {
  it("valida CPF pelos dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
  it("formata CPF e CNPJ", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });
});
