import { describe, expect, it } from "vitest";

import { describeOrigin } from "./origin";

describe("describeOrigin", () => {
  it("mensagem de anúncio no Instagram: rede, anúncio e campanha", () => {
    const o = describeOrigin({
      source: "instagram",
      medium: "paid",
      campaign: "Promo implante",
      content: "Vídeo 30s",
      term: "SP 25-44",
      channel: "instagram",
    });
    expect(o).toMatchObject({
      source: "Instagram",
      paid: true,
      short: "Instagram · anúncio Promo implante",
    });
    expect(o!.details).toEqual([
      { label: "Campanha", value: "Promo implante" },
      { label: "Anúncio", value: "Vídeo 30s" },
      { label: "Público", value: "SP 25-44" },
      { label: "Entrou por", value: "mensagem no Instagram" },
    ]);
  });

  it("mensagem orgânica: só a rede", () => {
    expect(
      describeOrigin({ source: "whatsapp", medium: "organic", channel: "whatsapp" }),
    ).toMatchObject({
      short: "WhatsApp",
      paid: false,
    });
  });

  it("formulário com UTM do Facebook pago", () => {
    expect(
      describeOrigin({
        source: "facebook",
        medium: "cpc",
        campaign: "black-friday",
        channel: "form",
      }),
    ).toMatchObject({ source: "Facebook", short: "Facebook · anúncio black-friday" });
  });

  it("lead do formulário de anúncio da Meta diz por onde entrou", () => {
    const o = describeOrigin({
      source: "facebook",
      medium: "paid",
      campaign: "c1",
      channel: "meta_ads",
    });
    expect(o!.details).toContainEqual({ label: "Entrou por", value: "formulário do anúncio" });
  });

  it("acesso direto e site de referência", () => {
    expect(describeOrigin({ source: "direto", medium: "none", channel: "form" })!.short).toBe(
      "Acesso direto",
    );
    expect(
      describeOrigin({ source: "blog.empresa.com", medium: "referral", channel: "form" })!.short,
    ).toBe("blog.empresa.com");
  });

  it("link ig.me com ref vira 'link'", () => {
    expect(
      describeOrigin({
        source: "instagram",
        medium: "referral",
        campaign: "bio",
        channel: "instagram",
      })!.short,
    ).toBe("Instagram · link bio");
  });

  it("sem origem não inventa nada", () => {
    expect(describeOrigin(null)).toBeNull();
    expect(describeOrigin({ source: "" })).toBeNull();
  });
});
