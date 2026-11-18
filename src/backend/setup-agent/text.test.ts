import { describe, expect, it } from "vitest";

import { chunkText, htmlToText, isPrivateHost, parseDuckResults, sameSiteLinks } from "./text";

describe("htmlToText", () => {
  it("tira script, estilo e menu e mantém o conteúdo", () => {
    const r = htmlToText(
      `<html><head><title>Clínica Sorriso &amp; Cia</title><style>a{}</style></head><body>
       <nav><a href="/">Início</a></nav><h1>Implantes</h1><p>Atendemos em Campinas.</p>
       <ul><li>Implante</li><li>Clareamento</li></ul><script>x()</script><footer>©</footer></body></html>`,
    );
    expect(r.title).toBe("Clínica Sorriso & Cia");
    expect(r.text).toContain("Implantes");
    expect(r.text).toContain("Atendemos em Campinas.");
    expect(r.text).toContain("• Implante");
    expect(r.text).not.toMatch(/Início|x\(\)|©/);
  });
});

describe("sameSiteLinks", () => {
  it("só links do mesmo site, sem arquivo, âncora nem repetição", () => {
    const html = `<a href="/servicos">s</a><a href="https://outro.com/x">o</a><a href="/servicos#a">s2</a>
      <a href="/tabela.pdf">pdf</a><a href="contato?ref=1">c</a>`;
    expect(sameSiteLinks(html, "https://sorriso.com.br/")).toEqual([
      "https://sorriso.com.br/servicos",
      "https://sorriso.com.br/contato",
    ]);
  });
});

describe("chunkText", () => {
  it("junta parágrafos até o limite e corta parágrafo gigante", () => {
    const t = ["a".repeat(500), "b".repeat(500), "c".repeat(900), "d".repeat(4000)].join("\n\n");
    const c = chunkText(t, 1800);
    expect(c[0]).toBe(`${"a".repeat(500)}\n\n${"b".repeat(500)}`);
    expect(c[1]).toBe("c".repeat(900));
    expect(c.slice(2).join("")).toBe("d".repeat(4000));
    expect(c.every((x) => x.length <= 1800)).toBe(true);
  });
});

describe("parseDuckResults", () => {
  it("tira o link real do redirecionamento e ignora anúncio", () => {
    const html = `<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsorriso.com.br%2F&rut=x">Clínica <b>Sorriso</b></a>
      <a class="result__snippet" href="#">Implantes em Campinas</a></div>
      <div class="result result--ad"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Anúncio</a></div>`;
    expect(parseDuckResults(html)).toEqual([
      {
        title: "Clínica Sorriso",
        url: "https://sorriso.com.br/",
        snippet: "Implantes em Campinas",
      },
    ]);
  });
});

describe("isPrivateHost", () => {
  it("bloqueia rede interna e metadados de nuvem", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.20.0.1",
      "169.254.169.254",
      "[::1]",
      "db.internal",
    ])
      expect(isPrivateHost(h), h).toBe(true);
    for (const h of ["sorriso.com.br", "8.8.8.8", "172.32.0.1"])
      expect(isPrivateHost(h), h).toBe(false);
  });
});
