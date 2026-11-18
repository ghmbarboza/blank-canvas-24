import { describe, expect, it } from "vitest";

import { kbQuery } from "./kb-query";

describe("kbQuery", () => {
  it("vira OR das palavras que importam", () => {
    expect(kbQuery("Vocês abrem aos sábados? Até que horas?")).toBe("abrem or sábados or horas");
  });
  it("tira pontuação e repetição e limita", () => {
    expect(kbQuery("preço, preço!!! do plano anual", 2)).toBe("preço or plano");
  });
  it("só saudação vira vazio", () => {
    expect(kbQuery("oi, bom dia")).toBe("");
  });
});
