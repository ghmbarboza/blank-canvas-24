import { describe, expect, it } from "vitest";

import { POS_VENDA_DEFAULT_MODULES } from "@/features/posvenda/journey";

import { EXTRA_MODULES, moduleForPath } from "./modules";

describe("moduleForPath", () => {
  it("acha o extra pelo endereço, inclusive nas telas filhas", () => {
    expect(moduleForPath("/empresas")?.id).toBe("empresas");
    expect(moduleForPath("/empresas/abc")?.id).toBe("empresas");
    expect(moduleForPath("/automacoes/123/")?.id).toBe("automacoes");
    expect(moduleForPath("/campanhas/modelos")?.id).toBe("campanhas");
    expect(moduleForPath("/meu-dia")?.id).toBe("meu_dia");
  });

  it("telas de venda ficam atrás da Captação de leads; Regras de pós-venda é do núcleo", () => {
    expect(moduleForPath("/origem")?.id).toBe("captacao");
    expect(moduleForPath("/formularios/abc")?.id).toBe("captacao");
    expect(moduleForPath("/sdr")?.id).toBe("captacao");
    expect(moduleForPath("/pos-venda")).toBeNull();
  });

  it("os recursos de conta nova existem e nenhum texto fala o nome antigo", () => {
    const ids = new Set(EXTRA_MODULES.map((m) => m.id));
    for (const id of POS_VENDA_DEFAULT_MODULES) expect(ids.has(id), id).toBe(true);
    expect(new Set(EXTRA_MODULES.map((m) => m.id)).size).toBe(EXTRA_MODULES.length);
    for (const m of EXTRA_MODULES)
      expect(`${m.label} ${m.what} ${m.when}`).not.toMatch(/nexus|nexa/i);
  });

  it("Campanhas de WhatsApp e as telas do núcleo não são extra", () => {
    expect(moduleForPath("/campanhas/whatsapp")).toBeNull();
    expect(moduleForPath("/painel")).toBeNull();
    expect(moduleForPath("/metasx")).toBeNull();
    expect(moduleForPath("/inbox/1")).toBeNull();
  });
});
