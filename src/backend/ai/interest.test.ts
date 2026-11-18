import { describe, expect, it } from "vitest";

import { mapInterests, normalizeScore, type CatalogItem } from "./interest";

const catalog: CatalogItem[] = [
  {
    ref: 1,
    id: "p1",
    name: "Plano",
    description: null,
    category: null,
    price: 100,
    billing: "monthly",
    keywords: [],
  },
  {
    ref: 2,
    id: "p2",
    name: "Setup",
    description: null,
    category: null,
    price: 500,
    billing: "one_time",
    keywords: [],
  },
];

describe("interesse do catálogo", () => {
  it("converte número da lista em produto e descarta inventado, repetido e confiança inválida", () => {
    const out = mapInterests(
      [
        { item: 1, confidence: 80, evidence: "quer o plano" },
        { item: "2", confidence: 150 },
        { item: 1, confidence: 50 },
        { item: 9, confidence: 90 },
        { item: "uuid-inventado", confidence: 90 },
        { item: 2, confidence: "x" },
      ],
      catalog,
    );
    expect(out).toEqual([
      { product_id: "p1", confidence: 80, evidence: "quer o plano" },
      { product_id: "p2", confidence: 100, evidence: null },
    ]);
  });
  it("normaliza score e deduz temperatura quando vem inválida", () => {
    expect(normalizeScore(120, "x")).toEqual({ score: 100, temperature: "hot" });
    expect(normalizeScore("40", undefined)).toEqual({ score: 40, temperature: "warm" });
    expect(normalizeScore(10, "cold")).toEqual({ score: 10, temperature: "cold" });
  });
});
