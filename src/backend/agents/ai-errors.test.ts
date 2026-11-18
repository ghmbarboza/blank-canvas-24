import { describe, expect, it } from "vitest";

import { friendlyAiError } from "./ai-errors";

describe("friendlyAiError", () => {
  it("chave recusada vira orientação, sem vazar a chave", () => {
    const e = friendlyAiError(new Error("IA 401: Incorrect API key provided: sk-chave****este."))!;
    expect(e.code).toBe("ai_bad_key");
    expect(e.message).toContain("Ajustes › Integrações");
    expect(e.message).not.toContain("sk-");
  });
  it("gateway sem ferramenta sugere chave própria", () => {
    expect(friendlyAiError(new Error("IA 400: tool_choice required is not supported"))?.code).toBe(
      "ai_no_tools",
    );
  });
  it("sem provedor, limite, crédito e demora", () => {
    expect(friendlyAiError(new Error("Nenhum provedor de IA configurado: x"))?.status).toBe(409);
    expect(friendlyAiError(new Error("limite de uso da IA atingido"))?.status).toBe(429);
    expect(friendlyAiError(new Error("créditos de IA esgotados"))?.status).toBe(402);
    expect(friendlyAiError(new Error("The operation was aborted due to timeout"))?.code).toBe(
      "ai_timeout",
    );
  });
  it("outro erro da IA dá o código, erro que não é da IA volta null", () => {
    expect(friendlyAiError(new Error("IA 500: boom"))?.message).toContain("500");
    expect(friendlyAiError(new Error("coluna x não existe"))).toBeNull();
  });
});
