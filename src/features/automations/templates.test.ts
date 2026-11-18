import { describe, expect, it } from "vitest";

import { validateGraph } from "./engine";
import { TEMPLATES, blankGraph } from "./templates";

describe("modelos prontos", () => {
  it.each(TEMPLATES.map((t) => [t.name, t] as const))("%s é um grafo válido", (_n, t) => {
    expect(validateGraph(t.graph)).toEqual([]);
  });
  it("o rascunho em branco é válido", () => {
    expect(validateGraph(blankGraph())).toEqual([]);
  });
});
