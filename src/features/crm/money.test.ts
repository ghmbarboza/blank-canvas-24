import { describe, expect, it } from "vitest";

import { moneyInputValue, parseMoneyInput } from "./money";

describe("parseMoneyInput", () => {
  it("lê o formato brasileiro com vírgula decimal", () => {
    expect(parseMoneyInput("1.500,50")).toBe(1500.5);
    expect(parseMoneyInput("R$ 180,00")).toBe(180);
  });

  it("lê ponto como milhar quando o valor vem formatado sem centavos (1.200 = mil e duzentos)", () => {
    expect(parseMoneyInput("1.200")).toBe(1200);
    expect(parseMoneyInput("12.345.678")).toBe(12345678);
  });

  it("aceita ponto decimal digitado à moda americana", () => {
    expect(parseMoneyInput("1500.50")).toBe(1500.5);
    expect(parseMoneyInput("99.9")).toBe(99.9);
  });

  it("vazio é zero e lixo é inválido", () => {
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("-")).toBeNull();
  });

  it("ida e volta: o que o painel mostra é o que ele salva", () => {
    for (const n of [180, 1200, 1500.5, 25000, 1234567.89])
      expect(parseMoneyInput(moneyInputValue(n))).toBe(n);
  });
});
