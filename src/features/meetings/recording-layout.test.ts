import { describe, expect, it } from "vitest";

import { gridLayout } from "./recording-layout";

describe("gridLayout", () => {
  it("1 pessoa ocupa a tela toda", () => {
    expect(gridLayout(1, 640, 360)).toEqual({ width: 640, height: 360, cells: [{ x: 0, y: 0 }] });
  });

  it("2 lado a lado, 3 e 4 em 2×2, 5 em 3 colunas", () => {
    expect(gridLayout(2, 640, 360).width).toBe(1280);
    expect(gridLayout(2, 640, 360).height).toBe(360);
    const g4 = gridLayout(4, 640, 360);
    expect([g4.width, g4.height]).toEqual([1280, 720]);
    expect(g4.cells[3]).toEqual({ x: 640, y: 360 });
    expect(gridLayout(3, 640, 360).height).toBe(720);
    expect(gridLayout(5, 640, 360).width).toBe(1920);
  });

  it("zero ou negativo vira uma célula", () => {
    expect(gridLayout(0, 640, 360).cells).toHaveLength(1);
  });
});
