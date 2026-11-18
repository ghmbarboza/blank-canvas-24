import { describe, expect, it } from "vitest";

import { helpCacheGet, helpCacheKey, helpCacheSet } from "./help-cache";

describe("cache da busca da central de ajuda (R9)", () => {
  it("normaliza a pergunta por conta", () => {
    expect(helpCacheKey("a", "  Como   PAGAR ")).toBe("a:como pagar");
    expect(helpCacheKey("a", "x")).not.toBe(helpCacheKey("b", "x"));
  });

  it("devolve o guardado dentro de 10 minutos e expira depois", () => {
    const k = helpCacheKey("conta-teste", "frete");
    helpCacheSet(k, [{ slug: "frete" }], 1_000);
    expect(helpCacheGet(k, 1_000 + 60_000)).toEqual([{ slug: "frete" }]);
    expect(helpCacheGet(k, 1_000 + 11 * 60_000)).toBeNull();
  });
});
