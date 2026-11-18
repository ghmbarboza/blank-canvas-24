import { describe, expect, it } from "vitest";

import { findTerms } from "./terms";

const TERMS = [
  { id: "1", term: "RD Station", category: "competitor" },
  { id: "2", term: "cancelar", category: "cancellation" },
  { id: "3", term: "caro", category: "price" },
];

describe("findTerms", () => {
  it("acha termo sem acento e sem caixa, contando ocorrências", () => {
    const r = findTerms("Estamos olhando o rd station. A RD-Station é mais barata.", TERMS);
    expect(r).toEqual([{ ...TERMS[0], hits: 2 }]);
  });

  it("só casa palavra inteira (caro não casa em 'carona')", () => {
    expect(findTerms("Peguei uma carona até aqui", TERMS)).toEqual([]);
    expect(findTerms("Achei CARO.", TERMS).map((t) => t.id)).toEqual(["3"]);
  });

  it("devolve vazio quando nada aparece ou o texto está vazio", () => {
    expect(findTerms("", TERMS)).toEqual([]);
    expect(findTerms("Tudo certo, vamos fechar", TERMS)).toEqual([]);
  });

  it("ignora acento no texto e no termo", () => {
    expect(
      findTerms("Quero cancelár o plano", [
        { id: "x", term: "cancelar", category: "cancellation" },
      ]),
    ).toHaveLength(1);
  });
});
