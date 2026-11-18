import { describe, expect, it } from "vitest";

import {
  dedupeItems,
  detectPlatform,
  jsonLdItems,
  metaProduct,
  nameKey,
  pageCompany,
  pageItems,
  parseShopify,
  parseSitemap,
  parseVtex,
  parseWoo,
  priceOf,
  productUrls,
  rankSitemaps,
} from "./extract";
import {
  HTML_INSTITUCIONAL,
  HTML_JSONLD_LIST,
  HTML_JSONLD_MENU,
  HTML_JSONLD_PRODUCT,
  HTML_MICRODATA,
  HTML_OG_PRODUCT,
  SHOPIFY_JSON,
  SITEMAP_INDEX,
  SITEMAP_URLS,
  VTEX_JSON,
  WOO_JSON,
} from "./fixtures";
import type { SiteItem } from "./types";

const it0 = (over: Partial<SiteItem>): SiteItem => ({
  name: "Item",
  description: null,
  price: null,
  category: null,
  url: null,
  image: null,
  kind: "product",
  ...over,
});

describe("priceOf", () => {
  it("lê preço de máquina e preço escrito em reais", () => {
    expect(priceOf("3499.90")).toBe(3499.9);
    expect(priceOf(180)).toBe(180);
    expect(priceOf("1.299,00")).toBe(1299);
    expect(priceOf("R$ 59,90")).toBe(59.9);
  });
  it("sem preço fica null (nunca inventa)", () => {
    expect(priceOf("")).toBeNull();
    expect(priceOf(undefined)).toBeNull();
    expect(priceOf("sob consulta")).toBeNull();
  });
});

describe("loja Shopify (/products.json)", () => {
  it("traz nome, preço da primeira variação, categoria, endereço e imagem", () => {
    const items = parseShopify(SHOPIFY_JSON, "https://moveisoslo.com.br");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      name: "Sofá Retrátil Oslo 3 lugares",
      description: "Sofá retrátil e reclinável em linho . • 2,30 m",
      price: 3499.9,
      category: "Sofás",
      url: "https://moveisoslo.com.br/products/sofa-retratil-oslo",
      image: "https://cdn.shopify.com/s/files/1/sofa.jpg",
      kind: "product",
    });
    expect(items[1]).toMatchObject({ name: "Mesa de Jantar Lisboa", price: 1890, category: null });
  });
  it("resposta que não é a lista de produtos devolve vazio", () => {
    expect(parseShopify({ errors: "Not Found" }, "https://x.com")).toEqual([]);
    expect(parseShopify(null, "https://x.com")).toEqual([]);
  });
});

describe("loja WooCommerce (Store API)", () => {
  it("converte o preço em centavos e limpa o HTML do nome", () => {
    const items = parseWoo(WOO_JSON, "https://belapele.com.br");
    expect(items.map((i) => [i.name, i.price, i.category])).toEqual([
      ["Kit Skincare Noite & Dia", 189.9, "Kits"],
      ["Protetor Solar FPS 60", 79.9, null],
    ]);
    expect(items[0]!.description).toBe("Sérum e hidratante.");
    expect(items[0]!.url).toBe("https://belapele.com.br/produto/kit-skincare/");
  });
});

describe("loja VTEX (busca pública do catálogo)", () => {
  it("traz o preço da primeira oferta e a última categoria", () => {
    expect(parseVtex(VTEX_JSON, "https://www.lojaesporte.com.br")).toEqual([
      {
        name: "Tênis Corrida Pro",
        description: "Leve e com amortecimento.",
        price: 399.9,
        category: "Tênis",
        url: "https://www.lojaesporte.com.br/tenis-corrida-pro/p",
        image: "https://lojaesporte.vteximg.com.br/arquivos/tenis.jpg",
        kind: "product",
      },
    ]);
  });
});

describe("dados estruturados na página (JSON-LD)", () => {
  it("produto dentro de @graph, com endereço relativo resolvido e bloco inválido ignorado", () => {
    const items = jsonLdItems(HTML_JSONLD_PRODUCT, "https://docemaria.com.br/bolos/cenoura");
    expect(items).toEqual([
      {
        name: "Bolo de Cenoura com Chocolate",
        description: "Bolo caseiro, serve 12 fatias.",
        price: 89.9,
        category: "Bolos",
        url: "https://docemaria.com.br/bolos/cenoura",
        image: "https://docemaria.com.br/img/cenoura.jpg",
        kind: "product",
      },
    ]);
  });
  it("lista de serviços: preço quando existe, null quando o site não mostra", () => {
    const items = jsonLdItems(HTML_JSONLD_LIST, "https://esteticabela.com.br/tratamentos");
    expect(items.map((i) => [i.name, i.price, i.kind, i.category])).toEqual([
      ["Limpeza de pele profunda", 180, "service", "Tratamentos"],
      ["Peeling de diamante", 250, "service", "Tratamentos"],
      ["Avaliação", null, "service", "Tratamentos"],
    ]);
  });
  it("cardápio: itens com a seção como categoria", () => {
    const items = jsonLdItems(HTML_JSONLD_MENU, "https://cantinadanona.com.br");
    expect(items.map((i) => [i.name, i.price, i.category])).toEqual([
      ["Lasanha à bolonhesa", 62, "Massas"],
      ["Nhoque ao sugo", 54, "Massas"],
    ]);
  });
  it("empresa: nome, descrição, horário e contato declarados", () => {
    expect(pageCompany(HTML_JSONLD_PRODUCT)).toMatchObject({
      name: "Doce Maria Confeitaria",
      sells: "Bolos caseiros por encomenda em Campinas.",
      policies: { contato: "+55 19 99999-0000" },
    });
    expect(pageCompany(HTML_JSONLD_MENU)).toMatchObject({
      name: "Cantina da Nona",
      policies: { horario: "Tu-Su 18:00-23:00" },
    });
    expect(pageCompany(HTML_INSTITUCIONAL).sells).toBe(
      "Clínica odontológica em Campinas: implantes, clareamento e aparelhos.",
    );
  });
});

describe("página de produto sem JSON-LD", () => {
  it("Open Graph de produto", () => {
    expect(metaProduct(HTML_OG_PRODUCT, "https://lojatech.com.br/p/cadeira")).toEqual({
      name: "Cadeira Gamer X",
      description: "Ergonômica, com apoio lombar.",
      price: 1299,
      category: null,
      url: "https://lojatech.com.br/p/cadeira",
      image: "https://lojatech.com.br/img/cadeira.jpg",
      kind: "product",
    });
  });
  it("microdata (itemprop)", () => {
    expect(metaProduct(HTML_MICRODATA, "https://x.com/p/camiseta")).toMatchObject({
      name: "Camiseta Básica Algodão",
      price: 59.9,
    });
  });
  it("página comum (sem marca de produto) não vira item", () => {
    expect(metaProduct(HTML_INSTITUCIONAL, "https://sorriso.com.br")).toBeNull();
    expect(pageItems(HTML_INSTITUCIONAL, "https://sorriso.com.br")).toEqual([]);
  });
});

describe("sitemap", () => {
  it("reconhece índice e lê os endereços (inclusive em CDATA)", () => {
    const idx = parseSitemap(SITEMAP_INDEX);
    expect(idx.index).toBe(true);
    expect(idx.urls).toEqual([
      "https://docemaria.com.br/sitemap-posts.xml",
      "https://docemaria.com.br/sitemap-produtos.xml",
    ]);
    expect(rankSitemaps(idx.urls)[0]).toBe("https://docemaria.com.br/sitemap-produtos.xml");
  });
  it("fica só com página de produto do mesmo site, sem repetir", () => {
    const { index, urls } = parseSitemap(SITEMAP_URLS);
    expect(index).toBe(false);
    expect(productUrls(urls, "https://docemaria.com.br")).toEqual([
      "https://docemaria.com.br/produto/bolo-de-cenoura",
      "https://www.docemaria.com.br/produto/bolo-de-fuba?ref=1&x=2",
    ]);
  });
  it("respeita o limite de páginas", () => {
    const many = Array.from({ length: 80 }, (_, i) => `https://loja.com/produto/item-${i}`);
    expect(productUrls(many, "https://loja.com", 30)).toHaveLength(30);
  });
});

describe("dedupe", () => {
  it("um item por nome (sem ligar para acento e caixa), juntando o que cada fonte sabia", () => {
    const out = dedupeItems([
      it0({ name: "Sofá Oslo", price: null, url: "https://l.com/p/sofa" }),
      it0({ name: "SOFA  OSLO", price: 3499.9, description: "Retrátil" }),
      it0({ name: "Mesa Lisboa", price: 1890 }),
    ]);
    expect(out).toEqual([
      it0({
        name: "Sofá Oslo",
        price: 3499.9,
        description: "Retrátil",
        url: "https://l.com/p/sofa",
      }),
      it0({ name: "Mesa Lisboa", price: 1890 }),
    ]);
  });
  it("corta no limite de itens", () => {
    const many = Array.from({ length: 260 }, (_, i) => it0({ name: `Item ${i}` }));
    expect(dedupeItems(many)).toHaveLength(200);
  });
  it("nameKey ignora pontuação", () => {
    expect(nameKey("  Sofá-Cama (Casal)! ")).toBe("sofa cama casal");
  });
});

describe("detectPlatform", () => {
  it("reconhece as lojas pelo HTML da página inicial", () => {
    expect(detectPlatform('<link href="https://cdn.shopify.com/s/x.css">')).toBe("shopify");
    expect(detectPlatform('<script src="/wp-content/plugins/woocommerce/a.js">')).toBe(
      "woocommerce",
    );
    expect(detectPlatform('<img src="https://loja.vtexassets.com/a.png">')).toBe("vtex");
    expect(detectPlatform(HTML_INSTITUCIONAL)).toBeNull();
  });
});
