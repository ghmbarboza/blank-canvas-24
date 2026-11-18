// deno test supabase/functions/_shared/interest.test.ts
import { assertEquals } from "jsr:@std/assert@1";

import { catalogPrompt, mapInterests, type CatalogItem } from "./interest.ts";

const catalog: CatalogItem[] = [
  {
    ref: 1,
    id: "p-pro",
    name: "Plano Pro",
    description: null,
    category: "Planos",
    price: 100,
    billing: "monthly",
    keywords: ["pro"],
  },
  {
    ref: 2,
    id: "p-impl",
    name: "Implantação",
    description: "Setup guiado",
    category: null,
    price: 200,
    billing: "one_time",
    keywords: [],
  },
];

Deno.test("interesse: número da lista vira o produto real", () => {
  const out = mapInterests([{ item: 1, confidence: 82, evidence: " pediu preço " }], catalog);
  assertEquals(out, [{ product_id: "p-pro", confidence: 82, evidence: "pediu preço" }]);
});

Deno.test("interesse: item fora da lista, repetido ou sem confiança é descartado", () => {
  const out = mapInterests(
    [
      { item: 9, confidence: 90 },
      { item: "2", confidence: 140 },
      { item: 2, confidence: 50 },
      { item: 1, confidence: "x" },
      { item: "uuid-inventado", confidence: 80 },
    ],
    catalog,
  );
  assertEquals(out, [{ product_id: "p-impl", confidence: 100, evidence: null }]);
});

Deno.test("interesse: resposta que não é lista vira vazio", () => {
  assertEquals(mapInterests(null, catalog), []);
  assertEquals(mapInterests({ item: 1 }, catalog), []);
});

Deno.test("catálogo no prompt traz número, preço e cobrança", () => {
  const text = catalogPrompt(catalog);
  assertEquals(text.split("\n")[0], "1. Plano Pro — R$ 100.00 por mês (Planos · termos: pro)");
});
