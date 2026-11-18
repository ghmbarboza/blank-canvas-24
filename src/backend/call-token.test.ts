import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { callToken, validCallToken } from "./call-token";

describe("token de quem discou (S10)", () => {
  const key = "segredo-de-teste";
  it("vale para quem discou e para aquela ligação", () => {
    const t = callToken(key, "user-a", "call-123456");
    expect(validCallToken(key, "user-a", "call-123456", t)).toBe(true);
  });
  it("não vale para outra pessoa, outra ligação, outra chave ou sem token", () => {
    const t = callToken(key, "user-a", "call-123456");
    expect(validCallToken(key, "user-b", "call-123456", t)).toBe(false);
    expect(validCallToken(key, "user-a", "call-999999", t)).toBe(false);
    expect(validCallToken("outra", "user-a", "call-123456", t)).toBe(false);
    expect(validCallToken(key, "user-a", "call-123456", undefined)).toBe(false);
    expect(validCallToken("", "user-a", "call-123456", t)).toBe(false);
  });
});

describe("ligação pela Zernio respeita a lista não ligar (S4)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/backend/providers/zernio-voice-actions.server.ts"),
    "utf8",
  );
  it.each(["callOnWhatsApp", "webCallDial"])("%s chama assertCanCall antes de discar", (fn) => {
    const body = src.slice(src.indexOf(`export async function ${fn}(`));
    const end = body.indexOf("\nexport ", 10);
    const fnBody = end > 0 ? body.slice(0, end) : body;
    expect(fnBody).toContain("await assertCanCall(");
    expect(fnBody.indexOf("assertCanCall(")).toBeLessThan(fnBody.indexOf("requireZernioKey("));
  });
});
