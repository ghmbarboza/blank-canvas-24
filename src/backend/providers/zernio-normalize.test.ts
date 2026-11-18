import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import * as fx from "./__fixtures__/zernio";
import {
  callChannel,
  callCostUsd,
  callNumbers,
  callOutcome,
  deliveryStatus,
  eventKind,
  failureText,
  nextStatus,
  normalizeMessage,
  numberReason,
  numberStatusFor,
  senderIdentity,
  signatureOk,
  zernioAccountOf,
} from "./zernio-normalize";

describe("assinatura do webhook (X-Zernio-Signature)", () => {
  const raw = JSON.stringify(fx.waReceivedWithPhone);
  const secret = "s3gredo";
  const sig = createHmac("sha256", secret).update(raw).digest("hex");

  it("aceita o HMAC-SHA256 hex do corpo cru", () => {
    expect(signatureOk(secret, raw, sig)).toBe(true);
    expect(signatureOk(secret, raw, sig.toUpperCase())).toBe(true);
  });
  it("recusa corpo alterado, segredo errado ou cabeçalho ausente", () => {
    expect(signatureOk(secret, `${raw} `, sig)).toBe(false);
    expect(signatureOk("outro", raw, sig)).toBe(false);
    expect(signatureOk(secret, raw, null)).toBe(false);
    expect(signatureOk("", raw, sig)).toBe(false);
  });
});

describe("eventos", () => {
  it("classifica cada evento documentado", () => {
    expect(eventKind("message.received")).toBe("message");
    expect(eventKind("message.sent")).toBe("message");
    expect(eventKind("message.read")).toBe("status");
    expect(eventKind("message.played")).toBe("status");
    expect(eventKind("call.ended")).toBe("call");
    expect(eventKind("call.permission_request")).toBe("permission");
    expect(eventKind("whatsapp.number.activated")).toBe("number");
    expect(eventKind("whatsapp.contact.identity_changed")).toBe("identity");
    expect(eventKind("post.published")).toBe("ignored");
  });
  it("acha a conta Zernio no account ou na ligação", () => {
    expect(zernioAccountOf(fx.waReceivedWithPhone)).toBe("66b2e19d8c3f5a7e9d0b1c2d");
    expect(zernioAccountOf({ call: { accountId: "abc123" } })).toBe("abc123");
    expect(zernioAccountOf({})).toBeNull();
  });
});

describe("mensagem recebida", () => {
  it("WhatsApp com telefone: ancora no BSUID e guarda o telefone", () => {
    const m = normalizeMessage(fx.waReceivedWithPhone)!;
    expect(m.threadId).toBe("66c3d2ae7b4f6c8d0e1f2a3b");
    expect(m.senderHandle).toBe("BR.1234567890123456");
    expect(m.contactPhone).toBe("5511999990000");
    expect(m.externalId).toMatch(/^wamid\./);
    expect(m.direction).toBe("in");
    expect(m.type).toBe("text");
    expect(m.metadata?.["bsuid"]).toBe("BR.1234567890123456");
  });
  it("WhatsApp só com nome de usuário (#19): sem telefone, BSUID como remetente", () => {
    const m = normalizeMessage(fx.waReceivedUsernameOnly)!;
    expect(m.senderHandle).toBe("BR.9876543210987654");
    expect(m.contactPhone).toBeNull();
    expect(m.type).toBe("audio");
    expect(m.media?.auth).toBe(true);
    expect(m.metadata?.["voice_note"]).toBe(true);
    expect(m.senderName).toBe("jane.shop");
  });
  it("Instagram: remetente pelo username, mídia sem chave", () => {
    const m = normalizeMessage(fx.igReceived)!;
    expect(m.senderHandle).toBe("jane_doe");
    expect(m.contactPhone).toBeNull();
    expect(m.media).toBeNull();
  });
  it("sender.id que é telefone vira telefone quando phoneNumber não vem", () => {
    expect(senderIdentity({ platform: "whatsapp", sender: { id: "5548999990000" } })).toEqual({
      handle: "5548999990000",
      phone: "5548999990000",
    });
  });
  it("ignora mensagem vazia ou sem conversa", () => {
    expect(normalizeMessage({ event: "message.received" })).toBeNull();
    expect(
      normalizeMessage({ message: { conversationId: "c", text: null, attachments: [] } }),
    ).toBeNull();
  });
});

describe("status de entrega", () => {
  it("mapeia os eventos e o texto do erro da Meta", () => {
    expect(deliveryStatus("message.delivered")).toBe("delivered");
    expect(deliveryStatus("message.read")).toBe("read");
    expect(deliveryStatus("message.failed")).toBe("failed");
    expect(deliveryStatus("message.sent")).toBeNull();
    expect(failureText(fx.waFailed)).toBe(
      "(131026) Message undeliverable Recipient is not reachable",
    );
  });
  it("nunca regride", () => {
    expect(nextStatus("sent", "delivered")).toBe("delivered");
    expect(nextStatus("read", "delivered")).toBeNull();
    expect(nextStatus("delivered", "failed")).toBe("failed");
    expect(nextStatus("read", "failed")).toBeNull();
    expect(nextStatus("sent", "bogus")).toBeNull();
  });
});

describe("ligações", () => {
  it("call.received do WhatsApp", () => {
    const c = fx.callReceivedWhatsApp.call!;
    expect(callChannel(c, "whatsapp")).toBe("whatsapp");
    expect(callNumbers(c)).toEqual({ from: "+5511999990000", to: "+5511930000000" });
  });
  it("atendida: completed, com custo total", () => {
    const c = fx.callEndedAnswered.call!;
    expect(callOutcome("call.ended", c)).toEqual({
      status: "completed",
      reason: "Atendida",
      answered: true,
    });
    expect(callCostUsd(c)).toBeCloseTo(0.0672);
  });
  it("recusada com SIP 486 é ocupado; sem total soma Zernio + Meta", () => {
    const c = fx.callEndedBusyOutbound.call!;
    expect(callOutcome("call.ended", c).status).toBe("busy");
    expect(callCostUsd(c)).toBe(0);
  });
  it("não atendida: perdida na entrada, sem resposta na saída", () => {
    expect(callOutcome("call.ended", { direction: "inbound", endReason: "no_answer" }).status).toBe(
      "missed",
    );
    expect(
      callOutcome("call.ended", { direction: "outbound", endReason: "no_answer" }).status,
    ).toBe("no_answer");
    expect(callOutcome("call.ended", { isVoicemail: true, endReason: "no_answer" }).status).toBe(
      "voicemail",
    );
  });
  it("call.failed carrega a mensagem do erro", () => {
    const o = callOutcome("call.failed", fx.callFailed.call!);
    expect(o.status).toBe("failed");
    expect(o.reason).toContain("SIP INVITE");
  });
  it("ligação telefônica sem meta id é pstn", () => {
    expect(callChannel({ id: "x" }, "instagram")).toBe("pstn");
  });
});

describe("números", () => {
  it("status por evento", () => {
    expect(numberStatusFor("whatsapp.number.kyc_submitted")).toBe("pending_regulatory");
    expect(numberStatusFor("whatsapp.number.activated")).toBe("active");
    expect(numberStatusFor("whatsapp.number.declined")).toBe("regulatory_declined");
    expect(numberStatusFor("whatsapp.number.action_required")).toBeNull();
  });
  it("motivo em português", () => {
    expect(numberReason(fx.numberSuspended)).toContain("cartão");
    expect(numberReason(fx.numberActivated)).toBeNull();
    expect(numberReason({ event: "whatsapp.number.verification_required" })).toContain(
      "identidade",
    );
  });
  it("permissão aceita traz o telefone e a validade", () => {
    expect(fx.permissionAccepted.permission?.response).toBe("accept");
    expect(eventKind(fx.permissionAccepted.event!)).toBe("permission");
  });
});
