import { describe, expect, it } from "vitest";

import { formatCnpj, isValidCnpj } from "./cnpj";

describe("cnpj", () => {
  it("aceita CNPJ com dígitos verificadores certos", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });
  it("recusa dígito errado, tamanho errado e sequência repetida", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
  it("formata só quando tem 14 dígitos", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("123")).toBe("123");
  });
});
