import { describe, expect, it } from "vitest";

import { journey, totals } from "./lib";

describe("oportunidade", () => {
  it("valor estimado soma os aceitos; potencial soma também as sugestões abertas", () => {
    const t = totals([
      { status: "accepted", kind: "core", line_total: 1200 },
      { status: "suggested", kind: "upsell", line_total: 200 },
      { status: "suggested", kind: "cross_sell", line_total: 50 },
      { status: "declined", kind: "cross_sell", line_total: 999 },
    ]);
    expect(t).toEqual({
      accepted: 1200,
      suggested: 250,
      potential: 1450,
      upsell: 200,
      crossSell: 50,
    });
  });

  it("a etapa atual é a primeira não cumprida do fluxo", () => {
    const steps = journey({ replied: true, classified: true, interests: 0, items: 0 });
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
  });

  it("fluxo completo marca as quatro etapas", () => {
    const steps = journey({ replied: true, classified: true, interests: 2, items: 3 });
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(steps.map((s) => s.label)).toEqual([
      "Atender",
      "Qualificar",
      "Interesse",
      "Oportunidade",
    ]);
  });
});
