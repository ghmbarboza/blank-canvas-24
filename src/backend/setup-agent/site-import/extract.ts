// Extratores do catálogo: cada um recebe o que o site publicou (JSON da loja, HTML, sitemap) e
// devolve itens no mesmo formato. Puro, sem rede: testado com amostras reais em extract.test.ts.
// Regra de ouro: só sai daqui o que está escrito no site. Preço ausente fica null, nunca inventado.
import { parsePreco } from "../produto";
import { htmlToText } from "../text";

import { MAX_ITEMS, siteItemSchema, type SiteCompany, type SiteItem } from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? `${v}` : "";
const arr = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];

function plain(html: unknown, max = 400): string | null {
  const s = str(html);
  if (!s) return null;
  // também resolve entidades (&amp;) em texto que veio sem marcação
  const t = /<[a-z][\s\S]*>|&[#a-z0-9]+;/i.test(s) ? htmlToText(s).text : s;
  const out = t.replace(/\s+/g, " ").trim().slice(0, max);
  return out || null;
}

function absolute(u: unknown, base: string): string | null {
  const s = str(isObj(u) ? (u["url"] ?? u["src"] ?? u["contentUrl"]) : u).trim();
  if (!s) return null;
  try {
    const url = new URL(s.startsWith("//") ? `https:${s}` : s, base);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Número de preço vindo de dado estruturado: "129.90", 129.9, "1.299,00", "R$ 59". */
export function priceOf(v: unknown): number | null {
  if (typeof v === "number") return parsePreco(v);
  const s = str(v).trim();
  if (!s) return null;
  // formato de máquina ("1299.00", "1299.5"): ponto é decimal
  if (/^\d+\.\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? parsePreco(Math.round(n * 100) / 100) : null;
  }
  return parsePreco(s);
}

const positive = (n: number | null) => (n !== null && n > 0 ? n : null);

function item(raw: Obj): SiteItem | null {
  const r = siteItemSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ------------------------------------------------------------------ lojas com lista pública

/** Shopify: GET /products.json → { products: [...] }. */
export function parseShopify(json: unknown, base: string): SiteItem[] {
  const products = isObj(json) ? arr(json["products"]) : [];
  return products.flatMap((p) => {
    if (!isObj(p)) return [];
    const variant = arr(p["variants"]).find(isObj);
    const handle = str(p["handle"]);
    const it = item({
      name: str(p["title"]),
      description: plain(p["body_html"]),
      // preço 0 é brinde ou item de teste da loja: entra sem preço
      price: positive(priceOf(variant?.["price"])),
      category: str(p["product_type"]) || null,
      url: handle ? absolute(`/products/${handle}`, base) : null,
      image: absolute(arr(p["images"]).find(isObj), base),
      kind: "product",
    });
    return it ? [it] : [];
  });
}

/** WooCommerce (Store API): GET /wp-json/wc/store/v1/products → [...]. Preço em centavos. */
export function parseWoo(json: unknown, base: string): SiteItem[] {
  return arr(json).flatMap((p) => {
    if (!isObj(p)) return [];
    const prices = isObj(p["prices"]) ? p["prices"] : {};
    const minor = Number(prices["currency_minor_unit"] ?? 2);
    const rawPrice = str(prices["price"]);
    const price = /^\d+$/.test(rawPrice)
      ? Number(rawPrice) / 10 ** (Number.isFinite(minor) ? minor : 2)
      : null;
    const cat = arr(p["categories"]).find(isObj);
    const it = item({
      name: plain(p["name"], 120) ?? "",
      description: plain(p["short_description"]) ?? plain(p["description"]),
      price: price !== null && price > 0 ? Math.round(price * 100) / 100 : null,
      category: cat ? plain(cat["name"], 60) : null,
      url: absolute(p["permalink"], base),
      image: absolute(arr(p["images"]).find(isObj), base),
      kind: "product",
    });
    return it ? [it] : [];
  });
}

/** VTEX: GET /api/catalog_system/pub/products/search → [...]. */
export function parseVtex(json: unknown, base: string): SiteItem[] {
  return arr(json).flatMap((p) => {
    if (!isObj(p)) return [];
    const sku = arr(p["items"]).find(isObj);
    const seller = arr(sku?.["sellers"]).find(isObj);
    const offer = isObj(seller?.["commertialOffer"]) ? seller["commertialOffer"] : {};
    const img = arr(sku?.["images"]).find(isObj);
    const cat = str(arr(p["categories"])[0]).split("/").filter(Boolean).pop() ?? null;
    const price = priceOf(offer["Price"]);
    const it = item({
      name: str(p["productName"]),
      description: plain(p["description"]) ?? plain(p["metaTagDescription"]),
      price: price && price > 0 ? price : null,
      category: cat,
      url: absolute(p["link"], base),
      image: absolute(img?.["imageUrl"], base),
      kind: "product",
    });
    return it ? [it] : [];
  });
}

// ------------------------------------------------------------------ dados estruturados na página

/** Blocos <script type="application/ld+json"> da página, já lidos (os inválidos são ignorados). */
export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const body = (m[1] ?? "").trim();
    if (!body) continue;
    try {
      out.push(JSON.parse(body));
    } catch {
      // alguns sites deixam quebra de linha solta dentro do texto: tenta de novo sem elas
      try {
        out.push(JSON.parse(body.replace(/[\n\r\t]+/g, " ")));
      } catch {
        // bloco inválido: ignora
      }
    }
  }
  return out;
}

const typesOf = (o: Obj): string[] => arr(o["@type"]).map((t) => str(t).replace(/^.*[/#]/, ""));
const isType = (o: Obj, ...names: string[]) => typesOf(o).some((t) => names.includes(t));

function offerPrice(offers: unknown): number | null {
  for (const o of arr(offers)) {
    if (!isObj(o)) continue;
    const spec = arr(o["priceSpecification"]).find(isObj);
    const p = priceOf(o["price"] ?? o["lowPrice"] ?? spec?.["price"]);
    if (p !== null && p > 0) return p;
    const nested = offerPrice(o["offers"]);
    if (nested !== null) return nested;
  }
  return null;
}

function fromNode(o: Obj, base: string, category: string | null): SiteItem | null {
  const kind = isType(o, "Service") ? "service" : "product";
  const cat = o["category"];
  return item({
    name: plain(o["name"], 120) ?? "",
    description: plain(o["description"]),
    // o preço pode estar na oferta do item ou nas ofertas das variações (tamanho, cor)
    price:
      offerPrice(o["offers"]) ??
      offerPrice(arr(o["hasVariant"]).map((v) => (isObj(v) ? v["offers"] : null))) ??
      offerPrice(o),
    category: (isObj(cat) ? plain(cat["name"], 60) : plain(cat, 60)) ?? category,
    url: absolute(o["url"] ?? o["@id"], base),
    image: absolute(arr(o["image"])[0], base),
    kind,
  });
}

const ITEM_TYPES = ["Product", "Service", "MenuItem", "IndividualProduct", "ProductGroup"];
const MAX_DEPTH = 8;

function walk(
  node: unknown,
  base: string,
  out: SiteItem[],
  category: string | null,
  depth: number,
) {
  if (depth > MAX_DEPTH || out.length >= MAX_ITEMS) return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, base, out, category, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  if (isType(node, ...ITEM_TYPES)) {
    const it = fromNode(node, base, category);
    if (it) out.push(it);
    return;
  }
  // Offer solto dentro de lista (catálogo de serviços): o item é o itemOffered, o preço é da oferta
  if (isType(node, "Offer") && isObj(node["itemOffered"])) {
    const it = fromNode({ ...node["itemOffered"], offers: node }, base, category);
    if (it) out.push(it);
    return;
  }
  const section = isType(node, "MenuSection", "OfferCatalog", "ItemList")
    ? (plain(node["name"], 60) ?? category)
    : category;
  for (const key of [
    "@graph",
    "product",
    "products",
    "itemListElement",
    "item",
    "mainEntity",
    "hasMenu",
    "hasMenuSection",
    "hasMenuItem",
    "hasOfferCatalog",
    "makesOffer",
    "itemOffered",
    "offers",
  ])
    if (node[key] !== undefined) walk(node[key], base, out, section, depth + 1);
}

/** Produtos, serviços e itens de cardápio declarados em JSON-LD na página. */
export function jsonLdItems(html: string, pageUrl: string): SiteItem[] {
  const out: SiteItem[] = [];
  for (const block of jsonLdBlocks(html)) walk(block, pageUrl, out, null, 0);
  return out;
}

function meta(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? plain(content, 500) : null;
}

/** Página de produto sem JSON-LD: Open Graph de produto ou microdata (itemprop). */
export function metaProduct(html: string, pageUrl: string): SiteItem | null {
  const ogType = meta(html, "og:type") ?? "";
  const price =
    priceOf(meta(html, "product:price:amount")) ??
    priceOf(meta(html, "og:price:amount")) ??
    priceOf(meta(html, "price"));
  const micro = /itemtype=["']https?:\/\/schema\.org\/Product["']/i.test(html);
  if (!/product/i.test(ogType) && price === null && !micro) return null;
  const name =
    meta(html, "og:title") ??
    plain(html.match(/itemprop=["']name["'][^>]*>([^<]{2,160})</i)?.[1], 120);
  if (!name) return null;
  const microPrice =
    price ??
    priceOf(html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]) ??
    priceOf(html.match(/itemprop=["']price["'][^>]*>\s*(?:R\$\s*)?([\d.,]+)/i)?.[1]);
  return item({
    name,
    description: meta(html, "og:description") ?? meta(html, "description"),
    price: microPrice,
    category: meta(html, "product:category"),
    url: pageUrl,
    image: absolute(meta(html, "og:image"), pageUrl),
    kind: "product",
  });
}

/** Tudo o que a página declara de forma estruturada (JSON-LD primeiro, depois meta). */
export function pageItems(html: string, pageUrl: string): SiteItem[] {
  const ld = jsonLdItems(html, pageUrl);
  if (ld.length) return ld;
  const one = metaProduct(html, pageUrl);
  return one ? [one] : [];
}

const ORG_TYPES = [
  "Organization",
  "LocalBusiness",
  "Store",
  "OnlineStore",
  "Restaurant",
  "Corporation",
  "MedicalBusiness",
  "ProfessionalService",
  "WebSite",
];

/** Nome, descrição, horário e contato declarados pela própria empresa (JSON-LD e meta). */
export interface CompanyHints {
  name?: string | null;
  sells?: string | null;
  tone?: string | null;
  policies?: Partial<SiteCompany["policies"]>;
}

export function pageCompany(html: string): CompanyHints {
  let name: string | null = null;
  let sells: string | null = null;
  let horario: string | null = null;
  let contato: string | null = null;
  const visit = (node: unknown, depth: number) => {
    if (depth > 4) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    if (!isObj(node)) return;
    if (node["@graph"]) visit(node["@graph"], depth + 1);
    if (!isType(node, ...ORG_TYPES)) return;
    const site = isType(node, "WebSite");
    name ??= plain(node["name"], 120);
    if (!site) sells ??= plain(node["description"], 400);
    const hours = arr(node["openingHours"]).map(str).filter(Boolean).join("; ");
    if (hours) horario ??= hours.slice(0, 300);
    const phone = plain(node["telephone"], 40);
    const email = plain(node["email"], 80);
    if (phone || email) contato ??= [phone, email].filter(Boolean).join(" · ");
  };
  for (const b of jsonLdBlocks(html)) visit(b, 0);
  name ??= meta(html, "og:site_name");
  sells ??= meta(html, "description") ?? meta(html, "og:description");
  return {
    name,
    sells,
    ...(horario || contato ? { policies: { horario, contato } } : {}),
  };
}

// ------------------------------------------------------------------ sitemap

/** Endereços de um sitemap e se ele é um índice (lista de outros sitemaps). */
export function parseSitemap(xml: string): { index: boolean; urls: string[] } {
  const index = /<sitemapindex[\s>]/i.test(xml);
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)) {
    const u = (m[1] ?? "").replace(/&amp;/g, "&");
    if (/^https?:\/\//i.test(u)) urls.push(u);
    if (urls.length >= 5000) break;
  }
  return { index, urls };
}

const PRODUCT_PATH =
  /\/(produtos?|products?|p|item|itens|loja|shop|servicos?|services?|planos?|cursos?|tratamentos?|cardapio|menu|catalogo)\/[^/]+|\/[^/]+\/p\/?$|-p-?\d+\/?$/i;
const NOT_PRODUCT =
  /\/(blog|noticias?|artigos?|tag|tags|categoria|category|collections?|autor|author|carrinho|cart|checkout|login|conta|account|busca|search|politica|privacy|termos)(\/|$)/i;

/** Dos endereços do sitemap, os que parecem página de produto ou serviço, do mesmo site. */
export function productUrls(urls: readonly string[], origin: string, max = 30): string[] {
  let host = "";
  try {
    host = new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    try {
      const url = new URL(u);
      if (url.hostname.replace(/^www\./, "") !== host) continue;
      if (/\.(xml|jpe?g|png|gif|webp|pdf)$/i.test(url.pathname)) continue;
      if (NOT_PRODUCT.test(url.pathname) || !PRODUCT_PATH.test(url.pathname)) continue;
      url.hash = "";
      const key = url.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
      if (out.length >= max) break;
    } catch {
      // endereço inválido: ignora
    }
  }
  return out;
}

/** No índice, os sitemaps que mais provavelmente listam produtos vêm primeiro. */
export function rankSitemaps(urls: readonly string[]): string[] {
  // "sitemap" contém "item": tira a palavra antes de procurar as pistas
  const score = (u: string) => {
    const path = u.replace(/sitemap/gi, "");
    return /produ|product|item|servic|catalog/i.test(path)
      ? 0
      : /page|pagina|post|blog/i.test(path)
        ? 2
        : 1;
  };
  return [...urls].sort((a, b) => score(a) - score(b));
}

// ------------------------------------------------------------------ dedupe

/** Chave de comparação: sem acento, sem caixa, sem pontuação. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Um item por nome: junta o que cada fonte sabia (preço, descrição, imagem) e corta no limite. */
export function dedupeItems(items: readonly SiteItem[], max = MAX_ITEMS): SiteItem[] {
  const byKey = new Map<string, SiteItem>();
  for (const it of items) {
    const key = nameKey(it.name);
    if (!key) continue;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, it);
      continue;
    }
    byKey.set(key, {
      ...cur,
      description: cur.description ?? it.description,
      price: cur.price ?? it.price,
      category: cur.category ?? it.category,
      url: cur.url ?? it.url,
      image: cur.image ?? it.image,
    });
  }
  return [...byKey.values()].slice(0, max);
}

/** Pistas da plataforma da loja no HTML da página inicial. */
export function detectPlatform(html: string): "shopify" | "woocommerce" | "vtex" | null {
  if (/cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html)) return "shopify";
  if (/vtexassets|vteximg|vtex\.com|__RUNTIME__|vtex-/i.test(html)) return "vtex";
  if (/woocommerce|wp-content\/plugins\/woo|wc-block/i.test(html)) return "woocommerce";
  return null;
}
