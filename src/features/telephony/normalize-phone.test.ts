import { describe, expect, it } from "vitest";

import { normalizePhone } from "./lib";

describe("normalizePhone (A3: telefone BR sem o 55)", () => {
  it("número brasileiro digitado com DDD ganha o 55", () => {
    expect(normalizePhone("(11) 90000-0001")).toBe("5511900000001");
    expect(normalizePhone("11 3333-4444")).toBe("551133334444");
  });
  it("número que já tem DDI fica como veio", () => {
    expect(normalizePhone("+55 11 90000-0001")).toBe("5511900000001");
    expect(normalizePhone("5511900000001")).toBe("5511900000001");
    expect(normalizePhone("+1 202 555 0123")).toBe("12025550123");
  });
  it("vazio vira null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
