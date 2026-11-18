import { describe, expect, it } from "vitest";

import { channelHealth, healthSummary } from "./health";

const ch = (provider: string, platform: string, status: string) => ({ provider, platform, status });

describe("channelHealth", () => {
  it("conectado é ao vivo e sem conserto", () => {
    expect(channelHealth(ch("zernio", "instagram", "connected"))).toMatchObject({
      tone: "live",
      fix: null,
    });
  });
  it("erro no QR manda ler o QR de novo, com atalho", () => {
    expect(channelHealth(ch("evolution", "whatsapp", "error"))).toMatchObject({
      tone: "problem",
      action: "qr",
    });
  });
  it("WhatsApp oficial desconectado aponta para o cartão do WhatsApp Oficial", () => {
    const h = channelHealth(ch("zernio", "whatsapp", "disconnected"));
    expect(h.tone).toBe("off");
    expect(h.fix).toContain("WhatsApp Oficial");
  });
  it("Meta direta com erro oferece os dados do webhook", () => {
    expect(channelHealth(ch("whatsapp_cloud", "whatsapp", "error")).action).toBe("webhook");
  });
  it("canal de provedor removido diz que saiu do Nexus e manda conectar o SMS pela Zadarma", () => {
    const h = channelHealth(ch("provedor_antigo", "sms", "error"));
    expect(h.tone).toBe("problem");
    expect(h.fix).toContain("Zadarma");
  });
  it("SMS pela Zadarma desconectado manda conferir a chave", () => {
    expect(channelHealth(ch("zadarma", "sms", "disconnected")).fix).toContain("Zadarma");
  });
  it("conectando não é problema", () => {
    expect(channelHealth(ch("zernio", "tiktok", "pending")).tone).toBe("pending");
  });
});

describe("healthSummary", () => {
  it("tudo normal quando ninguém está com problema ou fora", () => {
    expect(
      healthSummary([ch("webchat", "webchat", "connected"), ch("zernio", "x", "connecting")]),
    ).toEqual({ ok: true, problems: 0 });
  });
  it("conta desconectados e com erro", () => {
    expect(
      healthSummary([
        ch("webchat", "webchat", "error"),
        ch("zernio", "x", "disconnected"),
        ch("zernio", "x", "connected"),
      ]),
    ).toEqual({ ok: false, problems: 2 });
  });
});
