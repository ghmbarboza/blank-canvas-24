import { describe, expect, it, vi } from "vitest";

vi.mock("@/backend/http.server", () => ({ admin: () => ({}) }));

import { zadarmaRedirect } from "./route-call.server";

// Contrato da doc oficial (zadarma.com/en/support/api, "Call notification system - webhook"):
// resposta ao NOTIFY_START { "redirect": ID, "return_timeout": TIMEOUT }, onde ID é ramal
// (três dígitos), cenário "0-1", menu "0-main" ou "blacklist"; timeout 0 ou >= 3.
describe("resposta de roteamento para a Zadarma", () => {
  it("ramal do atendente com tempo para voltar ao menu", () => {
    expect(zadarmaRedirect("101", 20)).toEqual({ redirect: "101", return_timeout: 20 });
  });
  it("cenário e menu da URA", () => {
    expect(zadarmaRedirect("0-1", 0)).toEqual({ redirect: "0-1", return_timeout: 0 });
    expect(zadarmaRedirect("0-main", 0).redirect).toBe("0-main");
  });
  it("timeout entre 1 e 2 sobe para o mínimo de 3", () => {
    expect(zadarmaRedirect("101", 1).return_timeout).toBe(3);
  });
  it("recusa destino fora do formato", () => {
    expect(() => zadarmaRedirect("tel:+5511", 20)).toThrow();
    expect(() => zadarmaRedirect("", 20)).toThrow();
  });
  it("sai como JSON igual ao exemplo da doc", () => {
    expect(JSON.stringify(zadarmaRedirect("102", 25))).toBe(
      '{"redirect":"102","return_timeout":25}',
    );
  });
});
