import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  credentials,
  fieldErrors,
  newPassword,
  parseRegistration,
  registrationOutcome,
  resetRequest,
  safeAuthDestination,
} from "./authentication";

describe("registration", () => {
  it("includes the user's name in their profile metadata", () => {
    const input = { fullName: " Ana Silva ", email: "ana@example.com", password: "password123" };

    const result = parseRegistration(input);

    expect(result).toEqual({
      email: "ana@example.com",
      password: "password123",
      options: { data: { full_name: "Ana Silva" } },
    });
  });
  it("requires a name for profile creation", () => {
    const input = { fullName: " ", email: "ana@example.com", password: "password123" };

    const register = () => parseRegistration(input);

    expect(register).toThrow();
  });
  it("does not treat unconfirmed signup as a signed-in user", () => {
    const session = null;

    const outcome = registrationOutcome(session);

    expect(outcome).toBe("confirmation-required");
  });
});

describe("authentication redirects", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/entrar",
    "/reset-password",
  ])("rejects unsafe or looping destination %s", (destination) => {
    const result = safeAuthDestination(destination);

    expect(result).toBe("/painel");
  });
  it("preserves the internal destination after sign-in", () => {
    const result = safeAuthDestination("/canais");

    expect(result).toBe("/canais");
  });
});

describe("recuperação de senha e erros no campo", () => {
  it("pede e-mail válido para mandar o link", () => {
    expect(resetRequest.safeParse({ email: "x" }).success).toBe(false);
    expect(resetRequest.safeParse({ email: " ana@example.com " }).success).toBe(true);
  });
  it("exige senha nova de 8+ e confirmação igual", () => {
    const curta = newPassword.safeParse({ password: "123", confirm: "123" });
    expect(curta.success).toBe(false);
    const diferente = newPassword.safeParse({ password: "senha-boa-1", confirm: "senha-boa-2" });
    expect(diferente.success).toBe(false);
    if (!diferente.success) expect(fieldErrors(diferente.error).confirm).toMatch(/não são iguais/);
    expect(newPassword.safeParse({ password: "senha-boa-1", confirm: "senha-boa-1" }).success).toBe(
      true,
    );
  });
  it("aponta o erro de cada campo do login vazio", () => {
    const r = credentials.safeParse({ email: "", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrors(r.error);
      expect(e.email).toBe("E-mail inválido");
      expect(e.password).toMatch(/8 caracteres/);
    }
  });
  it("traduz o erro do login sem mensagem crua", () => {
    expect(authErrorMessage("Invalid login credentials")).toMatch(/incorretos/);
    expect(authErrorMessage("boom")).not.toMatch(/boom/);
  });
  it("não volta para a tela de redefinir depois de entrar", () => {
    expect(safeAuthDestination("/redefinir-senha")).toBe("/painel");
  });
});

describe("link de confirmação do e-mail", () => {
  it("leva o convite na URL, para funcionar em outra aba ou no celular", async () => {
    const { confirmationRedirect } = await import("./authentication");
    expect(confirmationRedirect("https://app.test", "/convite/abc")).toBe(
      "https://app.test/entrar?redirect=%2Fconvite%2Fabc",
    );
    expect(confirmationRedirect("https://app.test", "//mal.com")).toBe(
      "https://app.test/entrar?redirect=%2Fpainel",
    );
  });
});
