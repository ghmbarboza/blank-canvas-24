import { describe, expect, it } from "vitest";
import { countLabel, plural } from "./plural";

describe("plural", () => {
  it("usa o singular só para 1", () => {
    expect(plural(1, "negócio")).toBe("negócio");
    expect(plural(0, "negócio")).toBe("negócios");
    expect(plural(2, "canal", "canais")).toBe("canais");
  });
  it("monta a quantidade com a palavra certa", () => {
    expect(countLabel(1, "lead")).toBe("1 lead");
    expect(countLabel(2, "canal", "canais")).toBe("2 canais");
    expect(countLabel(null, "conversa")).toBe("0 conversas");
    expect(countLabel(1500, "contato")).toMatch(/^1\.500 contatos$/);
  });
});
