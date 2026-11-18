import { describe, expect, it } from "vitest";

import { checkEvolutionUrl, evolutionProblem, explainEvolutionError } from "./evolution-errors";

describe("endereço do servidor Evolution", () => {
  it("aceita o endereço certo e tira barra final e /manager", () => {
    expect(checkEvolutionUrl(" https://evo.loja.com.br/ ")).toEqual({
      ok: true,
      url: "https://evo.loja.com.br",
    });
    expect(checkEvolutionUrl("https://evo.loja.com.br/manager/")).toEqual({
      ok: true,
      url: "https://evo.loja.com.br",
    });
  });

  it("acrescenta https:// quando a pessoa cola só o domínio", () => {
    expect(checkEvolutionUrl("evo.loja.com.br")).toEqual({
      ok: true,
      url: "https://evo.loja.com.br",
    });
  });

  it("recusa vazio, http, espaço no meio e endereço local, dizendo o que fazer", () => {
    for (const bad of ["", "http://evo.loja.com.br", "evo loja.com", "https://localhost:8080"]) {
      const r = checkEvolutionUrl(bad);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.message.length).toBeGreaterThan(20);
    }
  });
});

describe("erros da Evolution em linguagem de dono", () => {
  it("chave errada", () => {
    expect(evolutionProblem("Evolution respondeu 401")).toBe("key");
    expect(evolutionProblem('Evolution: Evolution 403: "Forbidden"')).toBe("key");
  });

  it("endereço recusado ou sem https", () => {
    expect(evolutionProblem("Informe a URL https do servidor Evolution")).toBe("url");
    expect(evolutionProblem("Endereço do servidor Evolution recusado: rede interna")).toBe("url");
  });

  it("endereço que responde mas não é a Evolution", () => {
    expect(evolutionProblem("Evolution respondeu 404")).toBe("not_found");
  });

  it("servidor fora do ar", () => {
    for (const m of [
      "Evolution respondeu 502",
      "error sending request for url (https://x)",
      "Sem conexão com o servidor",
      "O servidor demorou demais (tempo esgotado)",
      "dns error: failed to lookup address",
    ])
      expect(evolutionProblem(m)).toBe("offline");
  });

  it("servidor ainda não salvo e erro desconhecido", () => {
    expect(evolutionProblem("Configure o servidor Evolution em Integrações")).toBe(
      "not_configured",
    );
    expect(evolutionProblem(null)).toBe("unknown");
    expect(evolutionProblem("algo estranho")).toBe("unknown");
  });

  it("toda explicação diz o que fazer e não usa travessão", () => {
    for (const m of ["Evolution respondeu 401", "Evolution respondeu 500", "x", null]) {
      const h = explainEvolutionError(m);
      expect(h.title.length).toBeGreaterThan(10);
      expect(h.fix.length).toBeGreaterThan(20);
      expect(`${h.title}${h.fix}`).not.toContain("—");
    }
  });
});
