import { describe, expect, it } from "vitest";

import {
  hashToken,
  newMagicToken,
  parseIdentity,
  signSession,
  verifySession,
} from "./portal-token";

const secret = "s".repeat(64);

describe("sessão do portal", () => {
  it("assina e confere", () => {
    const t = signSession({ a: "acc", c: "ct", exp: 2_000 }, secret);
    expect(verifySession(t, secret, 1_000)).toEqual({ a: "acc", c: "ct", exp: 2_000 });
  });

  it("recusa expirado, adulterado e com outro segredo", () => {
    const t = signSession({ a: "acc", c: "ct", exp: 2_000 }, secret);
    expect(verifySession(t, secret, 3_000)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ a: "acc", c: "outro", exp: 9e12 })).toString(
      "base64url",
    );
    expect(verifySession(`${forged}.${sig}`, secret, 1_000)).toBeNull();
    expect(verifySession(`${body}.${sig}`, "outro-segredo", 1_000)).toBeNull();
    expect(verifySession("lixo", secret)).toBeNull();
  });

  it("link mágico é aleatório e o hash é estável", () => {
    const a = newMagicToken();
    expect(a).not.toBe(newMagicToken());
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toHaveLength(64);
  });
});

describe("parseIdentity", () => {
  it("reconhece e-mail e celular", () => {
    expect(parseIdentity(" Maria@Loja.com.br ")).toEqual({
      kind: "email",
      value: "maria@loja.com.br",
    });
    expect(parseIdentity("(11) 98765-4321")).toEqual({ kind: "phone", value: "5511987654321" });
    expect(parseIdentity("+55 11 98765-4321")).toEqual({ kind: "phone", value: "5511987654321" });
    expect(parseIdentity("abc")).toBeNull();
  });
});
