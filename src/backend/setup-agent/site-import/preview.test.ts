import { describe, expect, it, vi } from "vitest";

import { groundAiResult } from "./ai";
import {
  HTML_INSTITUCIONAL,
  HTML_JSONLD_PRODUCT,
  HTML_OG_PRODUCT,
  HTML_SPA_SHELL,
  SHOPIFY_JSON,
  SITEMAP_URLS,
} from "./fixtures";
import { normalizeSiteUrl, previewSite, type Fetched, type Fetcher } from "./preview";
import { knowledgeText } from "./server";
import { confirmSchema } from "./types";

type Pages = Record<string, { body: string; type?: string }>;

/** Site de mentira: devolve o que está no mapa e registra o que foi pedido. */
function fakeSite(pages: Pages) {
  const asked: string[] = [];
  const fetch: Fetcher = async (url) => {
    asked.push(url);
    const hit = pages[url] ?? pages[url.replace(/\/$/, "")];
    if (!hit) throw new Error("o site respondeu 404");
    return { url, html: hit.body, type: hit.type ?? "text/html" } satisfies Fetched;
  };
  return { fetch, asked };
}

const SHOPIFY_HOME = `<html><head><title>Móveis Oslo</title>
<link rel="stylesheet" href="https://cdn.shopify.com/s/files/1/theme.css"></head>
<body><h1>Móveis Oslo</h1><p>Sofás e mesas com entrega em todo o Brasil.</p></body></html>`;

describe("normalizeSiteUrl", () => {
  it("aceita endereço sem https e recusa o que não é site", () => {
    expect(normalizeSiteUrl(" minhaloja.com.br ")).toBe("https://minhaloja.com.br/");
    expect(() => normalizeSiteUrl("")).toThrow(/Cole o endereço/);
    expect(() => normalizeSiteUrl("minhaloja")).toThrow(/não parece um site/);
  });
});

describe("previewSite: camadas", () => {
  it("loja Shopify: usa a lista pública e para por aí (sem ir ao sitemap)", async () => {
    const site = fakeSite({
      "https://moveisoslo.com.br/": { body: SHOPIFY_HOME },
      "https://moveisoslo.com.br/products.json?limit=250": {
        body: JSON.stringify(SHOPIFY_JSON),
        type: "application/json",
      },
    });
    const p = await previewSite("moveisoslo.com.br", { fetch: site.fetch });
    expect(p.source).toBe("shopify");
    expect(p.items.map((i) => i.name)).toEqual([
      "Sofá Retrátil Oslo 3 lugares",
      "Mesa de Jantar Lisboa",
    ]);
    expect(p.thin).toBe(false);
    expect(site.asked).not.toContain("https://moveisoslo.com.br/sitemap.xml");
  });

  it("página com dados estruturados: traz o item e os dados da empresa", async () => {
    const site = fakeSite({ "https://docemaria.com.br/": { body: HTML_JSONLD_PRODUCT } });
    const p = await previewSite("https://docemaria.com.br", { fetch: site.fetch });
    expect(p.source).toBe("dados_da_pagina");
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ name: "Bolo de Cenoura com Chocolate", price: 89.9 });
    expect(p.company.name).toBe("Doce Maria Confeitaria");
    expect(p.company.policies.contato).toBe("+55 19 99999-0000");
  });

  it("sem dados na página inicial: acha as páginas de produto pelo sitemap, só do mesmo site", async () => {
    const product = (name: string) =>
      HTML_OG_PRODUCT.replace(/Cadeira Gamer X/g, name).replace("1299.00", "89.00");
    const site = fakeSite({
      "https://docemaria.com.br/": {
        body: "<html><head><title>Doce Maria</title></head><body><p>Bolos caseiros.</p></body></html>",
      },
      "https://docemaria.com.br/sitemap.xml": { body: SITEMAP_URLS, type: "application/xml" },
      "https://docemaria.com.br/produto/bolo-de-cenoura": { body: product("Bolo de Cenoura") },
      "https://www.docemaria.com.br/produto/bolo-de-fuba?ref=1&x=2": {
        body: product("Bolo de Fubá"),
      },
    });
    const p = await previewSite("docemaria.com.br", { fetch: site.fetch });
    expect(p.source).toBe("paginas_de_produto");
    expect(p.items.map((i) => i.name).sort()).toEqual(["Bolo de Cenoura", "Bolo de Fubá"]);
    expect(site.asked.some((u) => u.includes("outrosite.com.br"))).toBe(false);
    expect(site.asked.some((u) => u.includes("/blog/"))).toBe(false);
  });

  it("site institucional: a IA extrai, e o que ela inventa é descartado", async () => {
    const site = fakeSite({
      "https://sorriso.com.br/": { body: HTML_INSTITUCIONAL },
      "https://sorriso.com.br/servicos": { body: HTML_INSTITUCIONAL },
      "https://sorriso.com.br/contato": { body: HTML_INSTITUCIONAL },
    });
    const ai = vi.fn(async () => ({
      company: {
        name: "Clínica Sorriso",
        sells: "Tratamentos odontológicos em Campinas.",
        tone: "próximo e cuidadoso",
        policies: {
          garantia: "1 ano em todos os procedimentos.",
          horario: "Segunda a sexta, das 8h às 18h.",
        },
      },
      items: [
        { name: "Clareamento dental a laser", price: 890, kind: "service" },
        { name: "Implante dentário unitário", price: 2500, kind: "service" },
        { name: "Harmonização facial", price: 1200, kind: "service" },
      ],
    }));
    const p = await previewSite("sorriso.com.br", { fetch: site.fetch, ai });
    expect(ai).toHaveBeenCalledTimes(1);
    expect(p.source).toBe("leitura_por_ia");
    // "Harmonização facial" não está no site: sai. O preço do implante não está no site: vira null.
    expect(p.items.map((i) => [i.name, i.price])).toEqual([
      ["Clareamento dental a laser", 890],
      ["Implante dentário unitário", null],
    ]);
    expect(p.company.tone).toBe("próximo e cuidadoso");
    expect(p.company.policies.garantia).toBe("1 ano em todos os procedimentos.");
    // não segue link para outro domínio nem para o blog
    expect(site.asked.some((u) => u.includes("instagram.com"))).toBe(false);
  });

  it("a IA falhou (crédito acabou): devolve o que tem e avisa, sem quebrar", async () => {
    const site = fakeSite({ "https://sorriso.com.br/": { body: HTML_INSTITUCIONAL } });
    const p = await previewSite("sorriso.com.br", {
      fetch: site.fetch,
      ai: async () => {
        throw new Error("créditos de IA esgotados");
      },
    });
    expect(p.items).toEqual([]);
    expect(p.notes.join(" ")).toMatch(/crédito de IA/);
    expect(p.company.sells).toMatch(/Clínica odontológica/);
  });
});

describe("previewSite: site sem conteúdo", () => {
  it("site que monta tudo no navegador: diz isso claramente e não inventa nada", async () => {
    const ai = vi.fn(async () => ({
      company: {},
      items: [{ name: "Produto inventado", price: 10 }],
    }));
    const site = fakeSite({ "https://lojaapp.com.br/": { body: HTML_SPA_SHELL } });
    const p = await previewSite("lojaapp.com.br", { fetch: site.fetch, ai });
    expect(p.items).toEqual([]);
    expect(p.source).toBe("vazio");
    expect(p.thin).toBe(true);
    expect(p.notes.join(" ")).toMatch(/monta o conteúdo no navegador ou bloqueia/);
    expect(p.notes.join(" ")).toMatch(/Cole aqui o texto|planilha/);
    // sem texto não há o que a IA ler: ela nem é chamada
    expect(ai).not.toHaveBeenCalled();
  });

  it("site fora do ar: erro em linguagem simples, com o caminho alternativo", async () => {
    const site = fakeSite({});
    await expect(previewSite("naoexiste.com.br", { fetch: site.fetch })).rejects.toThrow(
      /Não consegui abrir naoexiste\.com\.br.*cole aqui o texto/s,
    );
  });

  it("respeita o prazo total: com o tempo esgotado não busca mais páginas", async () => {
    let t = 0;
    const site = fakeSite({
      "https://docemaria.com.br/": { body: "<html><body><p>Bolos.</p></body></html>" },
      "https://docemaria.com.br/sitemap.xml": { body: SITEMAP_URLS, type: "application/xml" },
    });
    const slow: Fetcher = async (url, opts) => {
      const r = await site.fetch(url, opts);
      t += 39_000; // a página inicial consumiu quase todo o prazo
      return r;
    };
    const p = await previewSite("docemaria.com.br", { fetch: slow, now: () => t });
    expect(site.asked).toEqual(["https://docemaria.com.br/"]);
    expect(p.items).toEqual([]);
  });
});

describe("groundAiResult", () => {
  const corpus = "Corte feminino R$ 80,00. Escova progressiva a partir de R$ 250. Manicure.";
  it("mantém só o que está no texto e aceita o preço escrito de outro jeito", () => {
    const g = groundAiResult(
      {
        company: { sells: "Salão de beleza" },
        items: [
          { name: "Corte feminino", price: 80 },
          { name: "Escova progressiva", price: 250 },
          { name: "Manicure", price: 35 },
          { name: "Massagem relaxante", price: 120 },
          { name: "x" },
        ],
      },
      corpus,
    );
    expect(g.items.map((i) => [i.name, i.price])).toEqual([
      ["Corte feminino", 80],
      ["Escova progressiva", 250],
      ["Manicure", null],
    ]);
    expect(g.dropped).toBe(2);
    expect(g.company.sells).toBe("Salão de beleza");
  });
  it("resposta fora do formato não quebra", () => {
    expect(groundAiResult("texto solto", corpus).items).toEqual([]);
    expect(groundAiResult({ items: "nada" }, corpus).items).toEqual([]);
  });
});

describe("o que é gravado", () => {
  it("documento da base: resumo, políticas e a lista com preço", () => {
    const text = knowledgeText(
      "https://docemaria.com.br/",
      {
        name: "Doce Maria",
        sells: "Bolos caseiros por encomenda.",
        tone: null,
        policies: {
          troca: null,
          entrega: "Entrega em Campinas em até 2 dias.",
          garantia: null,
          horario: null,
          contato: null,
        },
      },
      [
        {
          name: "Bolo de Cenoura",
          description: "Serve 12.",
          price: 89.9,
          category: "Bolos",
          url: null,
          image: null,
          kind: "product",
        },
        {
          name: "Bolo de Fubá",
          description: null,
          price: null,
          category: null,
          url: null,
          image: null,
          kind: "product",
        },
      ],
    );
    expect(text).toContain("Empresa: Doce Maria");
    expect(text).toContain("Entrega: Entrega em Campinas em até 2 dias.");
    expect(text).toContain("• Bolo de Cenoura [Bolos] (R$ 89,90): Serve 12.");
    expect(text).toContain("• Bolo de Fubá");
    expect(text).not.toContain("null");
  });
  it("confirmação: valida os itens marcados e limita a quantidade", () => {
    const ok = confirmSchema.safeParse({
      url: "https://docemaria.com.br/",
      items: [{ name: " Bolo  de Cenoura ", price: 89.9, kind: "product" }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.items[0]).toMatchObject({
        name: "Bolo de Cenoura",
        description: null,
        url: null,
      });
      expect(ok.data.saveKnowledge).toBe(true);
      expect(ok.data.fillCompany).toBe(false);
    }
    expect(confirmSchema.safeParse({ url: "https://x.com", items: [{ name: "a" }] }).success).toBe(
      false,
    );
    const many = Array.from({ length: 201 }, (_, i) => ({ name: `Item ${i}` }));
    expect(confirmSchema.safeParse({ url: "https://x.com", items: many }).success).toBe(false);
  });
});
