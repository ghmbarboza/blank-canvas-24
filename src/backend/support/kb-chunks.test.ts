import { describe, expect, it } from "vitest";

import { CHUNK_MAX, chunkArticle } from "./kb-chunks";

describe("trechos da base (RAG)", () => {
  it("artigo curto vira um trecho só, com o título", () => {
    const c = chunkArticle({ title: "Horário", body: "Abrimos das 8h às 18h." });
    expect(c).toEqual(["Horário\nAbrimos das 8h às 18h."]);
  });
  it("cada trecho diz a seção e nenhum passa do tamanho", () => {
    const body = [
      "## Preços",
      "Consulta custa R$ 180. ".repeat(40),
      "## Convênios",
      "Aceitamos Unimed e Amil.",
    ].join("\n\n");
    const c = chunkArticle({ title: "Clínica", body });
    expect(c.length).toBeGreaterThan(1);
    expect(c.every((t) => t.length <= CHUNK_MAX + 40)).toBe(true);
    expect(c[0]).toMatch(/^Clínica › Preços\n/);
    expect(c.at(-1)).toMatch(/^Clínica › Convênios\nAceitamos Unimed/);
  });
  it("o trecho seguinte começa com o fim do anterior (sobreposição)", () => {
    const body = Array.from({ length: 30 }, (_, i) => `Frase número ${i} sobre o plano.`).join(" ");
    const [a, b] = chunkArticle({ title: "Planos", body }, 300, 80);
    const fimDoA = a!.split("\n")[1]!.slice(-40);
    expect(b!.includes(fimDoA.trim().split(" ").slice(-3).join(" "))).toBe(true);
  });
  it("artigo vazio ainda tem o título para ser achado", () => {
    expect(chunkArticle({ title: "Só título", body: "" })).toEqual(["Só título"]);
  });
});
