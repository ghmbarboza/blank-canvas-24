import { describe, expect, it, vi } from "vitest";

import { fetchAuthProviders, oauthErrorFromHash, parseAuthProviders } from "./auth-setup";

describe("parseAuthProviders", () => {
  it("lê e-mail e Google do retorno do servidor de login", () => {
    expect(parseAuthProviders({ external: { email: true, google: false } })).toEqual({
      email: true,
      google: false,
    });
  });
  it("devolve null quando o formato não é o esperado", () => {
    expect(parseAuthProviders(null)).toBeNull();
    expect(parseAuthProviders({ external: "x" })).toBeNull();
  });
});

describe("fetchAuthProviders", () => {
  it("consulta /auth/v1/settings com a chave pública", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { email: false, google: false } }),
    });
    const result = await fetchAuthProviders("https://x.lovable.cloud/", "chave", fetcher as never);
    expect(fetcher).toHaveBeenCalledWith("https://x.lovable.cloud/auth/v1/settings", {
      headers: { apikey: "chave" },
    });
    expect(result).toEqual({ email: false, google: false });
  });
  it("devolve null sem endereço, com erro de rede ou resposta ruim", async () => {
    expect(await fetchAuthProviders(undefined, "k")).toBeNull();
    expect(await fetchAuthProviders("u", "k", vi.fn().mockRejectedValue(new Error("x")) as never)).toBeNull();
    expect(await fetchAuthProviders("u", "k", vi.fn().mockResolvedValue({ ok: false }) as never)).toBeNull();
  });
});

describe("oauthErrorFromHash", () => {
  it("não acusa erro em endereço normal", () => {
    expect(oauthErrorFromHash("")).toBeNull();
    expect(oauthErrorFromHash("#access_token=abc")).toBeNull();
  });
  it("explica quando o Google está desligado na cópia", () => {
    const hash =
      "#error=invalid_request&error_description=provider+%2527google%2527+is+not+supported&state=x";
    expect(oauthErrorFromHash(hash)).toMatch(/ainda não está ligado nesta cópia/);
  });
  it("dá a mensagem geral nos outros erros", () => {
    expect(oauthErrorFromHash("#error=access_denied")).toMatch(/Não foi possível entrar/);
  });
});
