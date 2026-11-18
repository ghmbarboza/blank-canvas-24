import { describe, expect, it } from "vitest";

import { MASK, redact } from "@/backend/setup-agent/redact";

// O balão da pessoa na conversa da Nexa usa redact() antes de mostrar o texto: a chave colada no
// formulário vai inteira para o servidor (que guarda no cofre), mas nunca aparece na tela.
describe("balão da pessoa na Nexa", () => {
  it("mostra a chave da Zernio mascarada", () => {
    const enviado = "Chave da Zernio: sk_FakeZernio1234567890abcdefABCDEF";
    expect(redact(enviado).text).toBe(`Chave da Zernio: ${MASK}`);
  });
  it("texto sem chave fica igual", () => {
    expect(redact("Clínica Bem Viver").text).toBe("Clínica Bem Viver");
  });
});
