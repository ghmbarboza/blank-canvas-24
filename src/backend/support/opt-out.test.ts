import { describe, expect, it } from "vitest";

import { consentChannelFor, isOptOut } from "./opt-out";

describe("isOptOut", () => {
  it("reconhece a palavra sozinha, com acento, maiúscula e pontuação", () => {
    for (const t of ["SAIR", "Parar.", " stop ", "Descadastrar!", "Não quero mais receber"])
      expect(isOptOut(t), t).toBe(true);
  });
  it("não confunde frase de atendimento com descadastro", () => {
    for (const t of [
      "quero cancelar meu pedido",
      "como faço para sair do plano?",
      "parar de pagar",
      "",
      null,
    ])
      expect(isOptOut(t), String(t)).toBe(false);
  });
});

describe("consentChannelFor", () => {
  it("WhatsApp e SMS têm consentimento; chat do site e Instagram não", () => {
    expect(consentChannelFor("whatsapp")).toBe("whatsapp");
    expect(consentChannelFor("sms")).toBe("sms");
    expect(consentChannelFor("webchat")).toBeNull();
    expect(consentChannelFor("instagram")).toBeNull();
  });
});
