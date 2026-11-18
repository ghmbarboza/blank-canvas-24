import { describe, expect, it, vi } from "vitest";

vi.mock("@/backend/http.server", () => ({ admin: () => ({}) }));
vi.mock("@/backend/llm.server", () => ({ chooseProvider: vi.fn() }));
vi.mock("./tools.server", () => ({
  loadFacts: vi.fn(),
  loadSnapshot: vi.fn(),
  runSetupTool: vi.fn(),
}));

const { fallback } = await import("./nexa.server");

describe("fallback da Nexa", () => {
  it("rodada sem nada feito e sem fala não finge que respondeu", () => {
    expect(fallback([])).toMatch(/me perdi/);
  });
  it("só desenhou botões: aponta para eles", () => {
    expect(
      fallback([{ type: "block", block: { kind: "steps", title: "Plano", steps: [] } }]),
    ).toMatch(/opções abaixo/);
  });
  it("fez coisas: conta o que fez e o que falhou", () => {
    const r = fallback([
      { type: "action", action: { kind: "done", label: "Empresa salva", tool: "salvar_empresa" } },
      {
        type: "action",
        action: { kind: "error", label: "Falta a chave", tool: "conectar_integracao" },
      },
    ]);
    expect(r).toBe(
      "Feito: Empresa salva. Não consegui: Falta a chave. O que mais você quer configurar?",
    );
  });
});
