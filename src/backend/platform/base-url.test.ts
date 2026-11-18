import { afterEach, describe, expect, it, vi } from "vitest";

import { originServesProject, projectRef, shouldReclaimBase } from "./base-url";

describe("endereço do app no remix (S1)", () => {
  it("lê o ref do projeto da URL do Supabase", () => {
    expect(projectRef("https://imxzoctbafmtgwtttcsq.supabase.co")).toBe("imxzoctbafmtgwtttcsq");
    expect(projectRef("nada")).toBeNull();
    expect(projectRef(undefined)).toBeNull();
  });
  const base = { originMismatch: true, originAccepted: true, ownProject: "remixabcdefghij" };
  it("remix com o endereço do original: troca pela origem do dono", () => {
    expect(shouldReclaimBase({ ...base, storedProject: "originalabcdefgh" })).toBe(true);
  });
  it("endereço gravado fora do ar ou que não é um Nexus: troca", () => {
    expect(shouldReclaimBase({ ...base, storedProject: null })).toBe(true);
  });
  it("segundo domínio do mesmo projeto: não troca (o dono escolhe na tela)", () => {
    expect(shouldReclaimBase({ ...base, storedProject: "remixabcdefghij" })).toBe(false);
  });
  it("sem divergência, origem recusada (prévia/http) ou sem ref próprio: não troca", () => {
    expect(shouldReclaimBase({ ...base, originMismatch: false, storedProject: null })).toBe(false);
    expect(shouldReclaimBase({ ...base, originAccepted: false, storedProject: null })).toBe(false);
    expect(shouldReclaimBase({ ...base, ownProject: null, storedProject: "x" })).toBe(false);
  });
});

describe("troca do endereço pelo dono (R2): o destino prova que é deste projeto", () => {
  afterEach(() => vi.unstubAllGlobals());
  const health = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("aceita quando o /api/health responde com o ref deste projeto, sem seguir redirecionamento", async () => {
    const f = health({ project: "remixabcdefghij" });
    vi.stubGlobal("fetch", f);
    await expect(originServesProject("https://app.cliente.com", "remixabcdefghij")).resolves.toBe(
      true,
    );
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.cliente.com/api/health");
    expect(init.redirect).toBe("error");
  });
  it("recusa outro projeto, resposta de erro, falha de rede e endereço interno ou http", async () => {
    vi.stubGlobal("fetch", health({ project: "outroprojetoabc" }));
    await expect(originServesProject("https://evil.example", "remixabcdefghij")).resolves.toBe(
      false,
    );
    vi.stubGlobal("fetch", health({ project: "remixabcdefghij" }, 500));
    await expect(originServesProject("https://app.cliente.com", "remixabcdefghij")).resolves.toBe(
      false,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("redirect");
      }),
    );
    await expect(originServesProject("https://app.cliente.com", "remixabcdefghij")).resolves.toBe(
      false,
    );
    const f = health({ project: "remixabcdefghij" });
    vi.stubGlobal("fetch", f);
    for (const o of ["http://app.cliente.com", "https://10.0.0.1", "https://localhost:3000"])
      await expect(originServesProject(o, "remixabcdefghij"), o).resolves.toBe(false);
    await expect(originServesProject("https://app.cliente.com", null)).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
