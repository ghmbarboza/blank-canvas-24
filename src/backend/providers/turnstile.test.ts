import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/backend/http.server", () => ({ admin: () => ({}) }));
vi.mock("@/backend/integrations.server", () => ({ getIntegration: async () => null }));

const { readOutcome, verifyTurnstile } = await import("./turnstile.server");

afterEach(() => vi.unstubAllGlobals());

describe("Turnstile", () => {
  it("lê sucesso e códigos de erro do siteverify", () => {
    expect(readOutcome({ success: true, "error-codes": [] })).toEqual({ ok: true, codes: [] });
    expect(readOutcome({ success: false, "error-codes": ["timeout-or-duplicate"] })).toEqual({
      ok: false,
      codes: ["timeout-or-duplicate"],
    });
    expect(readOutcome(null)).toEqual({ ok: false, codes: [] });
    expect(readOutcome({ success: "true" }).ok).toBe(false);
  });

  it("sem token recusa sem chamar a Cloudflare", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await verifyTurnstile("s", "", null)).toEqual({
      ok: false,
      codes: ["missing-input-response"],
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("manda secret, token e IP no formato de formulário", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      expect(body.get("secret")).toBe("sec");
      expect(body.get("response")).toBe("tok");
      expect(body.get("remoteip")).toBe("1.2.3.4");
      return new Response(JSON.stringify({ success: true }));
    });
    vi.stubGlobal("fetch", f);
    expect((await verifyTurnstile("sec", "tok", "1.2.3.4")).ok).toBe(true);
  });

  it("falha de rede vira recusa, nunca aprovação", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("rede");
    });
    expect(await verifyTurnstile("sec", "tok", null)).toEqual({
      ok: false,
      codes: ["internal-error"],
    });
  });
});
