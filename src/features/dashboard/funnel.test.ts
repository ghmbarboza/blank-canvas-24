import { describe, expect, it } from "vitest";

import { stageConversions } from "./funnel";

describe("stageConversions", () => {
  it("nunca passa de 100%: conta quem chegou na etapa ou além (caso 7 · 1 · 2 da produção)", () => {
    const conv = stageConversions([7, 1, 2, 3]);
    expect(conv).toEqual([46, 83, 60, null]);
    for (const c of conv) if (c !== null) expect(c).toBeLessThanOrEqual(100);
  });

  it("etapa vazia no fim não divide por zero", () => {
    expect(stageConversions([4, 0, 0])).toEqual([0, null, null]);
    expect(stageConversions([])).toEqual([]);
  });
});
