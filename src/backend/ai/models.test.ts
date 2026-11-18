import { describe, expect, it } from "vitest";

import { gatewayChatUrl, gatewayModel, isGatewayClaude, shouldFallback } from "./models";

describe("modelos da IA embutida", () => {
  it("cada tarefa tem o seu modelo; Opus 5.5 responde o cliente", () => {
    expect(gatewayModel("reply", null)).toBe("anthropic/claude-opus-5-5");
    expect(gatewayModel("fast", null)).toBe("anthropic/claude-haiku-4-5");
    expect(gatewayModel("voice", {})).toBe("anthropic/claude-haiku-4-5");
  });
  it("a conta troca o modelo, mas só por um id válido do gateway", () => {
    expect(gatewayModel("reply", { included_models: { reply: "google/gemini-3.8-flash" } })).toBe(
      "google/gemini-3.8-flash",
    );
    expect(gatewayModel("reply", { included_models: { reply: "qualquer coisa; drop" } })).toBe(
      "anthropic/claude-opus-5-5",
    );
  });
  it("Claude vai para /messages e o resto para /chat/completions", () => {
    expect(isGatewayClaude("anthropic/claude-opus-5-5")).toBe(true);
    expect(gatewayChatUrl("anthropic/claude-opus-5-5")).toMatch(/\/v1\/messages$/);
    expect(gatewayChatUrl("google/gemini-3.8-flash")).toMatch(/\/chat\/completions$/);
  });
  it("recua para o reserva em erro do modelo, nunca em limite ou crédito", () => {
    expect(shouldFallback(500)).toBe(true);
    expect(shouldFallback(400)).toBe(true);
    expect(shouldFallback(429)).toBe(false);
    expect(shouldFallback(402)).toBe(false);
    expect(shouldFallback(401)).toBe(false);
  });
});
