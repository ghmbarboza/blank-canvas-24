// De onde veio quem mandou a mensagem. Puro (testado sem banco).
// A Zernio entrega na primeira mensagem de uma conversa aberta por anúncio:
//   metadata.ad       → { adId, name, campaignId, campaignName, adSetName, synced } (anúncio sincronizado)
//   metadata.referral → objeto da Meta como veio (ctwa_clid, source_id, headline, source_type, ref…)
// Sem nada disso, a origem é o próprio canal (orgânico): "veio do Instagram".

export interface MessageAd {
  adId?: string | null;
  name?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adSetId?: string | null;
  adSetName?: string | null;
}

export interface MessageReferral {
  ctwa_clid?: string;
  source_id?: string;
  source_type?: string;
  source_url?: string;
  headline?: string;
  ref?: string;
  source?: string;
  ad_id?: string;
}

/** Mesmo formato do primeiro/último toque dos formulários (touchFrom), mais o id do anúncio. */
export interface Touch {
  source: string;
  medium: string;
  campaign: string | null;
  content: string | null;
  term: string | null;
  channel: string;
  at: string;
  ad_id?: string | null;
  ctwa_clid?: string | null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function messageOrigin(metadata: Record<string, unknown> | null | undefined): {
  ad: MessageAd | null;
  referral: MessageReferral | null;
} {
  const ad = metadata?.["ad"];
  const ref = metadata?.["referral"];
  return {
    ad: ad && typeof ad === "object" ? (ad as MessageAd) : null,
    referral: ref && typeof ref === "object" ? (ref as MessageReferral) : null,
  };
}

/** Toque da mensagem: pago quando veio de anúncio, orgânico quando a pessoa chamou direto. */
export function messageTouch(
  platform: string,
  metadata: Record<string, unknown> | null | undefined,
  at: string,
): { touch: Touch; paid: boolean } {
  const { ad, referral } = messageOrigin(metadata);
  const adId = text(ad?.adId) ?? text(referral?.source_id) ?? text(referral?.ad_id);
  const fromAd =
    Boolean(ad) ||
    Boolean(referral?.ctwa_clid) ||
    (referral?.source_type ?? "").toLowerCase() === "ad" ||
    (referral?.source ?? "").toUpperCase() === "ADS";
  if (fromAd) {
    return {
      paid: true,
      touch: {
        source: platform,
        medium: "paid",
        campaign: text(ad?.campaignName) ?? text(referral?.headline),
        content: text(ad?.name) ?? text(referral?.headline),
        term: text(ad?.adSetName),
        channel: platform,
        at,
        ad_id: adId,
        ctwa_clid: text(referral?.ctwa_clid),
      },
    };
  }
  // link ig.me/m.me com ?ref=: a campanha é o próprio ref (ex.: bio, QR da loja)
  const ref = text(referral?.ref);
  return {
    paid: false,
    touch: {
      source: platform,
      medium: ref ? "referral" : "organic",
      campaign: ref,
      content: null,
      term: null,
      channel: platform,
      at,
    },
  };
}
