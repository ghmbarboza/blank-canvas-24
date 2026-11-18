import { describe, expect, it } from "vitest";

import { isPrivateHost } from "../../supabase/functions/_shared/net";

import { assertPublicUrl, publicFetch } from "./net-guard.server";

describe("SSRF: só endereço público (S11, S12)", () => {
  it.each([
    "http://127.0.0.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/",
    "https://[::1]/",
    "https://[fd00::1]/",
    "https://[::]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:a9fe:a9fe]/latest/meta-data",
    "https://2130706433/",
    "https://localhost:8080/",
    "https://db.internal/",
    "ftp://example.com/",
    "https://user:pass@example.com/",
  ])("recusa %s", async (u) => {
    await expect(assertPublicUrl(u)).rejects.toThrow();
  });
  it("https-only recusa http", async () => {
    await expect(assertPublicUrl("http://8.8.8.8/", { httpsOnly: true })).rejects.toThrow();
  });
  it("aceita IP público literal", async () => {
    await expect(assertPublicUrl("https://8.8.8.8/x")).resolves.toBeInstanceOf(URL);
  });
  it("edge: mesma lista de hosts internos", () => {
    for (const h of [
      "127.0.0.1",
      "169.254.1.1",
      "100.64.0.1",
      "[::1]",
      "::ffff:10.0.0.1",
      "x.local",
    ])
      expect(isPrivateHost(h), h).toBe(true);
    expect(isPrivateHost("api.evolution.com.br")).toBe(false);
  });
  it("publicFetch recusa interno antes de abrir conexão e não segue redirecionamento", async () => {
    await expect(publicFetch("https://[::ffff:10.0.0.1]/")).rejects.toThrow(/interno/);
    const calls: RequestInit[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response("ok");
    }) as typeof fetch;
    try {
      await publicFetch("https://8.8.8.8/x", { method: "POST" });
    } finally {
      globalThis.fetch = orig;
    }
    expect(calls[0]?.redirect).toBe("error");
    expect(calls[0]?.method).toBe("POST");
  });
  it("publicFetch com maxRedirects confere cada salto e recusa o que vai para rede interna", async () => {
    const orig = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
      seen.push(String(u));
      expect(init?.redirect).toBe("manual");
      if (String(u).includes("/a"))
        return new Response(null, { status: 302, headers: { location: "https://8.8.4.4/b" } });
      if (String(u).includes("/b"))
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/" },
        });
      return new Response("ok");
    }) as typeof fetch;
    try {
      await expect(publicFetch("https://8.8.8.8/a", {}, { maxRedirects: 3 })).rejects.toThrow(
        /interno/,
      );
      expect(seen).toEqual(["https://8.8.8.8/a", "https://8.8.4.4/b"]);
    } finally {
      globalThis.fetch = orig;
    }
  });
  it("publicFetch httpsOnly recusa http", async () => {
    await expect(publicFetch("http://8.8.8.8/x", {}, { httpsOnly: true })).rejects.toThrow(
      /protocolo/,
    );
  });
});
