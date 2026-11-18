import { describe, expect, it } from "vitest";

import {
  DEFAULT_WA_PRICING,
  estimateCost,
  flowCostPerContact,
  formatBRL,
  normalizePricing,
  toCategory,
  unitPrice,
} from "./whatsapp-pricing";

const P = normalizePricing({ marketing: 0.35, utility: 0.04, authentication: 0.04, service: 0.04 });

describe("tabela de preço do WhatsApp", () => {
  it("padrões vêm da tabela da Meta em reais (01/10/2026)", () => {
    expect(DEFAULT_WA_PRICING.marketing).toBe(0.3217);
    expect(DEFAULT_WA_PRICING.utility).toBe(0.035);
    expect(DEFAULT_WA_PRICING.authentication).toBe(0.035);
    expect(DEFAULT_WA_PRICING.service_free_monthly).toBe(1000);
  });
  it("valor quebrado volta ao padrão e aceita vírgula", () => {
    const p = normalizePricing({ marketing: "0,40", utility: -1, authentication: "x" });
    expect(p.marketing).toBe(0.4);
    expect(p.utility).toBe(DEFAULT_WA_PRICING.utility);
    expect(p.authentication).toBe(DEFAULT_WA_PRICING.authentication);
    expect(normalizePricing(null)).toEqual(DEFAULT_WA_PRICING);
  });
  it("categoria da Meta vira a nossa", () => {
    expect(toCategory("MARKETING")).toBe("marketing");
    expect(toCategory("UTILITY")).toBe("utility");
    expect(toCategory("AUTHENTICATION")).toBe("authentication");
    expect(toCategory("service")).toBe("service");
    expect(toCategory(undefined)).toBe("service");
  });
});

describe("custo estimado", () => {
  it("modelo cobra pela categoria; texto livre e atendimento são grátis", () => {
    expect(unitPrice(P, "marketing", { template: true })).toBe(0.35);
    expect(unitPrice(P, "utility", { template: true })).toBe(0.04);
    expect(unitPrice(P, "marketing", { template: false })).toBe(0);
    expect(unitPrice(P, "service", { template: true })).toBe(0);
  });
  it("destinatários × preço, arredondado em centavos", () => {
    expect(estimateCost(P, "marketing", 1000)).toBe(350);
    expect(estimateCost(P, "utility", 333)).toBe(13.32);
    expect(estimateCost(P, "marketing", -5)).toBe(0);
    expect(estimateCost(P, "marketing", Number.NaN)).toBe(0);
  });
  it("custo por contato soma os passos de WhatsApp com modelo", () => {
    expect(
      flowCostPerContact(P, [
        { type: "whatsapp", config: { category: "marketing", template_name: "oferta" } },
        { type: "whatsapp", config: { category: "utility", template_name: "lembrete" } },
        { type: "whatsapp", config: { category: "marketing", text: "oi", template_name: " " } },
        { type: "email", config: {} },
      ]),
    ).toBe(0.39);
  });
  it("formata em reais", () => {
    expect(formatBRL(350).replace(/\s/g, " ")).toBe("R$ 350,00");
  });
});
