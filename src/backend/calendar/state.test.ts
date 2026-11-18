import { describe, expect, it } from "vitest";

import { signState, tokenKey, verifyState } from "./state";

const ST = {
  a: "8371c770-b8e5-4e55-9ce6-5cf44c30b5ac",
  u: "6347ea57-af4f-48ed-9891-bfb61b4b92ee",
  p: "google" as const,
  exp: 2_000,
};

describe("state do OAuth", () => {
  it("assina e confere ida e volta", () => {
    expect(verifyState(signState(ST, "s3gredo"), "s3gredo", 1_000)).toEqual(ST);
  });

  it("recusa segredo errado, corpo adulterado e expirado", () => {
    const t = signState(ST, "s3gredo");
    expect(verifyState(t, "outro", 1_000)).toBeNull();
    const [, mac] = t.split(".");
    const forged = `${Buffer.from(JSON.stringify({ ...ST, a: "outra" })).toString("base64url")}.${mac}`;
    expect(verifyState(forged, "s3gredo", 1_000)).toBeNull();
    expect(verifyState(t, "s3gredo", 3_000)).toBeNull();
    expect(verifyState("lixo", "s3gredo", 1_000)).toBeNull();
  });

  it("chave do token cabe na regra do Vault", () => {
    const k = tokenKey("microsoft", ST.u);
    expect(k).toMatch(/^[a-z0-9_]{2,40}$/);
    expect(k.startsWith("mcal_")).toBe(true);
  });
});
