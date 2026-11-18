import { describe, expect, it } from "vitest";

import { csatText } from "./conversation-csat.server";

describe("csatText", () => {
  it("chama pelo primeiro nome e traz o link", () => {
    expect(csatText("Ana", "https://x/csat/t")).toBe(
      "Oi, Ana! Como foi o nosso atendimento? Leva 10 segundos: https://x/csat/t",
    );
  });
  it("sem nome, só 'Oi!'", () => {
    expect(csatText("", "https://x/csat/t").startsWith("Oi! Como foi")).toBe(true);
  });
});
