import { describe, expect, it } from "vitest";

import { evalDrop } from "./eval-drop";

describe("evalDrop", () => {
  it("não acusa queda sem avaliação anterior", () => {
    expect(evalDrop({ latest: 0.5, previous: null, version: 1 })).toBeNull();
  });
  it("não acusa queda quando a nota subiu", () => {
    expect(evalDrop({ latest: 0.8, previous: 0.6, version: 2 })).toBeNull();
  });
  it("não acusa queda se continua nos 90% exigidos", () => {
    expect(evalDrop({ latest: 0.92, previous: 1, version: 2 })).toBeNull();
  });
  it("acusa queda abaixo de 90% com os percentuais", () => {
    expect(evalDrop({ latest: 0.68, previous: 0.95, version: 3 })).toEqual({ from: 95, to: 68 });
  });
  it("sem dado não há queda", () => {
    expect(evalDrop(undefined)).toBeNull();
  });
});
