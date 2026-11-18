import { describe, expect, it } from "vitest";

import { messageTouch } from "./zernio-origin";

const at = "2026-10-27T12:00:00.000Z";

describe("messageTouch", () => {
  it("anúncio sincronizado na Zernio traz campanha, anúncio e conjunto", () => {
    const r = messageTouch(
      "whatsapp",
      {
        ad: {
          adId: "120",
          name: "Spring CTWA",
          campaignName: "Spring leads",
          adSetName: "SP 25-44",
        },
        referral: { ctwa_clid: "AbC", source_id: "120", headline: "Fale conosco" },
      },
      at,
    );
    expect(r.paid).toBe(true);
    expect(r.touch).toMatchObject({
      source: "whatsapp",
      medium: "paid",
      campaign: "Spring leads",
      content: "Spring CTWA",
      term: "SP 25-44",
      ad_id: "120",
      ctwa_clid: "AbC",
    });
  });

  it("anúncio que a Zernio não sincronizou usa o título do anúncio da Meta", () => {
    const r = messageTouch(
      "whatsapp",
      { referral: { ctwa_clid: "x", source_id: "9", headline: "Implante" } },
      at,
    );
    expect(r.touch).toMatchObject({ medium: "paid", campaign: "Implante", ad_id: "9" });
  });

  it("clique em anúncio do Instagram ou Messenger (source ADS) também é pago", () => {
    expect(
      messageTouch("instagram", { referral: { source: "ADS", ad_id: "77" } }, at).touch,
    ).toMatchObject({
      source: "instagram",
      medium: "paid",
      ad_id: "77",
    });
  });

  it("link ig.me com ref vira campanha de indicação", () => {
    const r = messageTouch(
      "instagram",
      { referral: { ref: "bio", source: "IGME-SOURCE-LINK" } },
      at,
    );
    expect(r.paid).toBe(false);
    expect(r.touch).toMatchObject({ medium: "referral", campaign: "bio" });
  });

  it("sem anúncio nem link, a origem é o próprio canal (orgânico)", () => {
    expect(messageTouch("instagram", {}, at)).toEqual({
      paid: false,
      touch: {
        source: "instagram",
        medium: "organic",
        campaign: null,
        content: null,
        term: null,
        channel: "instagram",
        at,
      },
    });
    expect(messageTouch("whatsapp", undefined, at).touch.medium).toBe("organic");
  });
});
