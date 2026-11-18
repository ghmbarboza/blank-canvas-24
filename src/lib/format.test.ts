import { describe, expect, it } from "vitest";

import { formatMoney, formatPhone, initials } from "./format";

describe("formatPhone", () => {
  it("formata celular brasileiro com 9 dígitos", () => {
    expect(formatPhone("5511988887777")).toBe("+55 11 98888-7777");
  });
  it("formata fixo brasileiro com 8 dígitos", () => {
    expect(formatPhone("551133334444")).toBe("+55 11 3333-4444");
  });
  it("mantém número estrangeiro com +", () => {
    expect(formatPhone("351912345678")).toBe("+351912345678");
  });
  it("devolve vazio para nulo", () => {
    expect(formatPhone(null)).toBe("");
  });
});

describe("initials", () => {
  it("usa primeira e última palavra", () => {
    expect(initials("Mariana de Souza Siqueira")).toBe("MS");
  });
  it("lida com nome vazio", () => {
    expect(initials("  ")).toBe("?");
  });
});

describe("formatMoney", () => {
  it("formata reais sem centavos", () => {
    expect(formatMoney(12500).replace(/\s/g, " ")).toBe("R$ 12.500");
  });
  it("compacta valores grandes quando pedido", () => {
    expect(formatMoney(145000, true)).toMatch(/145/);
  });
  it("trata texto numérico vindo do Postgres", () => {
    expect(formatMoney("1500.00").replace(/\s/g, " ")).toBe("R$ 1.500");
  });
});
