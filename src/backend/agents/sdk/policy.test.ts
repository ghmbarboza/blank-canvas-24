import { describe, expect, it } from "vitest";

import { approvalSummary, requiresApproval, sdkAgentName } from "./policy";

describe("requiresApproval", () => {
  it("cobrança e sequência pedem o sim; consulta segue sozinha", () => {
    expect(requiresApproval("asaas_create_charge", { isComposio: false })).toBe(true);
    expect(requiresApproval("enroll_sequence", { isComposio: false })).toBe(true);
    expect(requiresApproval("kb_search", { isComposio: false })).toBe(false);
  });
  it("ação externa (Composio) pede por padrão", () => {
    expect(requiresApproval("GMAIL_SEND_EMAIL", { isComposio: true })).toBe(true);
  });
  it("a configuração da ferramenta manda nos dois sentidos", () => {
    expect(
      requiresApproval("asaas_create_charge", {
        isComposio: false,
        config: { requires_approval: false },
      }),
    ).toBe(false);
    expect(
      requiresApproval("book", { isComposio: false, config: { requires_approval: true } }),
    ).toBe(true);
  });
});

describe("sdkAgentName", () => {
  it("tira acento e símbolo e fica único pelo id", () => {
    expect(sdkAgentName("Júlia (SDR)", "1a2b3c4d-0000-0000-0000-000000000000")).toBe(
      "Julia_SDR_1a2b3c",
    );
    expect(sdkAgentName("Júlia (SDR)", "9f8e7d6c-0000-0000-0000-000000000000")).not.toBe(
      sdkAgentName("Júlia (SDR)", "1a2b3c4d-0000-0000-0000-000000000000"),
    );
    expect(sdkAgentName("!!!", "abcdef12-0000")).toBe("agente_abcdef");
  });
});

describe("approvalSummary", () => {
  it("cobrança vira valor em reais", () => {
    expect(
      approvalSummary("asaas_create_charge", { value: 350, description: "Manutenção" }, "Bia"),
    ).toMatch(/^Bia quer cobrar R\$\s350,00 \(Manutenção\)\.$/);
  });
  it("ferramenta genérica mostra só campos simples", () => {
    expect(approvalSummary("GMAIL_SEND_EMAIL", { to: "a@b.com", body: { x: 1 } }, "")).toBe(
      "A IA quer usar GMAIL_SEND_EMAIL (to: a@b.com).",
    );
  });
});
