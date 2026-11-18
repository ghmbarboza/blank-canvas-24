import { describe, expect, it } from "vitest";

import { routeSend } from "./zernio-send.server";
import { attachmentTypeFor, inWindowBody, templateBody } from "./zernio-whatsapp.server";

// Corpos conferidos com messages/send-inbox-message e messages/create-inbox-conversation.
describe("contrato de envio de WhatsApp na Zernio", () => {
  it("texto na conversa: accountId + message", () => {
    expect(inWindowBody({ zernioAccountId: "acc1", conversationId: "c1", text: "Oi" })).toEqual({
      accountId: "acc1",
      message: "Oi",
    });
  });
  it("documento leva attachmentName; áudio pode ir como nota de voz", () => {
    expect(
      inWindowBody({
        zernioAccountId: "acc1",
        conversationId: "c1",
        media: { url: "https://x/f.pdf", mime: "application/pdf", name: "Proposta.pdf" },
      }),
    ).toEqual({
      accountId: "acc1",
      attachmentUrl: "https://x/f.pdf",
      attachmentType: "file",
      attachmentName: "Proposta.pdf",
    });
    expect(
      inWindowBody({
        zernioAccountId: "a",
        conversationId: "c",
        media: { url: "u", mime: "audio/ogg", voiceNote: true },
      }),
    ).toMatchObject({ attachmentType: "audio", voiceNote: true });
    expect(attachmentTypeFor("image/png")).toBe("image");
    expect(attachmentTypeFor("video/mp4")).toBe("video");
    expect(attachmentTypeFor(null)).toBe("file");
  });
  it("modelo abre a conversa pelo telefone (participantId sem +)", () => {
    expect(
      templateBody({
        zernioAccountId: "acc1",
        participantId: "5511999990000",
        template: { name: "retomada", language: "pt_BR", params: ["Ana"] },
      }),
    ).toEqual({
      accountId: "acc1",
      participantId: "5511999990000",
      templateName: "retomada",
      templateLanguage: "pt_BR",
      templateParams: ["Ana"],
    });
  });
});

describe("rota do envio (janela de 24 h)", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  const open = {
    external_thread_id: "66c3d2ae7b4f6c8d0e1f2a3b",
    last_inbound_at: "2026-10-27T10:00:00Z",
  };
  it("dentro da janela responde na conversa", () => {
    expect(routeSend(open, { text: "Oi" }, now)).toEqual({ via: "conversation" });
  });
  it("fora da janela sem modelo recusa; com modelo vai por modelo", () => {
    const closed = { ...open, last_inbound_at: "2026-10-25T10:00:00Z" };
    expect(routeSend(closed, { text: "Oi" }, now)).toEqual({
      via: "refuse",
      reason: "window_closed",
    });
    expect(routeSend(closed, { template: { name: "t", language: "pt_BR" } }, now)).toEqual({
      via: "template",
    });
  });
  it("conversa aberta por nós pelo telefone só aceita modelo", () => {
    expect(
      routeSend(
        { external_thread_id: "5511999990000", last_inbound_at: "2026-10-27T10:00:00Z" },
        { text: "Oi" },
        now,
      ),
    ).toEqual({
      via: "refuse",
      reason: "no_thread",
    });
  });
  it("vazio recusa", () => {
    expect(routeSend(open, { text: "  " }, now)).toEqual({ via: "refuse", reason: "empty" });
  });
});
