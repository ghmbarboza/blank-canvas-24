import { describe, expect, it } from "vitest";

import { moduleForPath } from "./modules";

describe("moduleForPath", () => {
  it("acha o extra pelo endereço, inclusive nas telas filhas", () => {
    expect(moduleForPath("/empresas")?.id).toBe("empresas");
    expect(moduleForPath("/empresas/abc")?.id).toBe("empresas");
    expect(moduleForPath("/automacoes/123/")?.id).toBe("automacoes");
    expect(moduleForPath("/campanhas/modelos")?.id).toBe("campanhas");
    expect(moduleForPath("/meu-dia")?.id).toBe("meu_dia");
  });

  it("Campanhas de WhatsApp e as telas do núcleo não são extra", () => {
    expect(moduleForPath("/campanhas/whatsapp")).toBeNull();
    expect(moduleForPath("/painel")).toBeNull();
    expect(moduleForPath("/metasx")).toBeNull();
    expect(moduleForPath("/inbox/1")).toBeNull();
  });
});
