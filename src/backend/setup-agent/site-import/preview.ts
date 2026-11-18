// Leitura do site em camadas, parando na primeira que der resultado bom:
//   1. loja com lista pública (Shopify, WooCommerce, VTEX)
//   2. dados estruturados na página (JSON-LD, Open Graph, microdata)
//   3. sitemap → páginas de produto (com limite de páginas e de tempo)
//   4. leitura das páginas principais e extração por IA, conferida contra o texto
// Sem rede própria: quem chama injeta `fetch` (com a proteção de endereço interno) e a IA. Assim o
// mesmo código roda no servidor, nos testes e num teste de fumaça contra sites reais.
import { htmlToText, sameSiteLinks } from "../text";

import { AI_SCHEMA, AI_SYSTEM, corpusOf, groundAiResult, type PageText } from "./ai";
import {
  dedupeItems,
  detectPlatform,
  pageCompany,
  pageItems,
  parseShopify,
  parseSitemap,
  parseVtex,
  parseWoo,
  productUrls,
  rankSitemaps,
  type CompanyHints,
} from "./extract";
import {
  EMPTY_COMPANY,
  MAX_ITEMS,
  type SiteCompany,
  type SiteItem,
  type SitePreview,
  type SiteSource,
} from "./types";

export interface Fetched {
  url: string;
  html: string;
  type: string;
}
export type Fetcher = (
  url: string,
  opts?: { accept?: string; timeoutMs?: number },
) => Promise<Fetched>;
/** Chamada de IA: recebe o sistema, o texto e o schema; devolve o JSON cru. */
export type AiExtract = (p: {
  system: string;
  text: string;
  schema: Record<string, unknown>;
}) => Promise<unknown>;

export interface PreviewDeps {
  fetch: Fetcher;
  /** sem IA (ou sem crédito), as camadas 1 a 3 continuam valendo */
  ai?: AiExtract | undefined;
  now?: () => number;
}

export const LIMITS = {
  totalMs: 40_000,
  /** reserva para a IA responder dentro do prazo total */
  aiReserveMs: 16_000,
  // a hospedagem limita quantas chamadas externas cabem num pedido: por isso o teto é contido
  productPages: 20,
  textPages: 4,
  sitemaps: 2,
  parallel: 6,
  /** com pelo menos isto de itens estruturados, não precisa pedir itens à IA */
  goodEnough: 3,
} as const;

const JSON_ACCEPT = "application/json,text/plain;q=0.8,*/*;q=0.5";
const XML_ACCEPT = "application/xml,text/xml;q=0.9,*/*;q=0.5";
const PRIORITY =
  /produt|servi|preco|preço|plano|catalog|cardapio|menu|loja|sobre|quem-somos|contato|troca|devolu|entrega|frete|garantia|politica|faq|duvida|tratament|curso/i;

function sameSite(a: string, b: string): boolean {
  try {
    const h = (u: string) => new URL(u).hostname.replace(/^www\./, "");
    return h(a) === h(b);
  } catch {
    return false;
  }
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function pool<T, R>(
  list: readonly T[],
  size: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, worker));
  return out;
}

function mergeCompany(base: SiteCompany, extra: CompanyHints): SiteCompany {
  return {
    name: base.name ?? extra.name ?? null,
    sells: base.sells ?? extra.sells ?? null,
    tone: base.tone ?? extra.tone ?? null,
    policies: {
      troca: base.policies.troca ?? extra.policies?.troca ?? null,
      entrega: base.policies.entrega ?? extra.policies?.entrega ?? null,
      garantia: base.policies.garantia ?? extra.policies?.garantia ?? null,
      horario: base.policies.horario ?? extra.policies?.horario ?? null,
      contato: base.policies.contato ?? extra.policies?.contato ?? null,
    },
  };
}

/** Endereço digitado pela pessoa → URL https válida, ou erro em linguagem simples. */
export function normalizeSiteUrl(raw: string): string {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) throw new Error("Cole o endereço do site (ex.: minhaloja.com.br)");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    throw new Error(
      "Esse endereço não parece um site. Confira e cole de novo (ex.: minhaloja.com.br)",
    );
  }
  if (!url.hostname.includes("."))
    throw new Error("Esse endereço não parece um site. Confira e cole de novo");
  return url.toString();
}

export async function previewSite(rawUrl: string, deps: PreviewDeps): Promise<SitePreview> {
  const now = deps.now ?? Date.now;
  const started = now();
  const left = () => LIMITS.totalMs - (now() - started);
  const notes: string[] = [];
  let pagesRead = 0;

  const get = async (url: string, accept?: string): Promise<Fetched | null> => {
    const budget = Math.min(10_000, left());
    if (budget < 1_500) return null;
    try {
      const r = await deps.fetch(url, { ...(accept ? { accept } : {}), timeoutMs: budget });
      pagesRead++;
      return r;
    } catch {
      return null;
    }
  };

  const start = normalizeSiteUrl(rawUrl);
  let home: Fetched;
  try {
    home = await deps.fetch(start, { timeoutMs: 12_000 });
    pagesRead++;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    const host = new URL(start).hostname;
    // 401, 403, 429 e 503 na página inicial são bloqueio de robô, não endereço errado
    if (/respondeu (401|403|406|429|503)/.test(why))
      throw new Error(
        `O site ${host} bloqueia leitura automática, então não consegui ler. Cole aqui o texto do que vocês vendem ou envie uma planilha ou arquivo.`,
      );
    throw new Error(
      `Não consegui abrir ${host} (${why}). Confira o endereço ou cole aqui o texto do que vocês vendem.`,
    );
  }
  const base = home.url;
  const origin = new URL(base).origin;
  const isHtml = /html/i.test(home.type) || /<html[\s>]/i.test(home.html);
  let company = mergeCompany(EMPTY_COMPANY, isHtml ? pageCompany(home.html) : {});
  let items: SiteItem[] = [];
  let source: SiteSource = "vazio";

  // 1. loja com lista pública
  const platform = isHtml ? detectPlatform(home.html) : null;
  if (platform === "shopify") {
    const r = await get(`${origin}/products.json?limit=250`, JSON_ACCEPT);
    const found = r ? parseShopify(parseJson(r.html), origin) : [];
    if (found.length) {
      items = found;
      source = "shopify";
    }
  } else if (platform === "woocommerce") {
    for (const path of [
      "/wp-json/wc/store/v1/products?per_page=100",
      "/wp-json/wc/store/products?per_page=100",
    ]) {
      const r = await get(`${origin}${path}`, JSON_ACCEPT);
      const found = r ? parseWoo(parseJson(r.html), origin) : [];
      if (found.length) {
        items = found;
        source = "woocommerce";
        break;
      }
    }
  } else if (platform === "vtex") {
    const r = await get(
      `${origin}/api/catalog_system/pub/products/search?_from=0&_to=49`,
      JSON_ACCEPT,
    );
    const found = r ? parseVtex(parseJson(r.html), origin) : [];
    if (found.length) {
      items = found;
      source = "vtex";
    }
  }

  // 2. dados estruturados na própria página
  if (!items.length && isHtml) {
    const found = pageItems(home.html, base);
    if (found.length) {
      items = found;
      source = "dados_da_pagina";
    }
  }

  // 3. sitemap → páginas de produto
  const fromStore = source === "shopify" || source === "woocommerce" || source === "vtex";
  if (!fromStore && items.length < LIMITS.goodEnough && left() > LIMITS.aiReserveMs + 4_000) {
    const fromSitemap = await readSitemapProducts(origin, get, () => left() - LIMITS.aiReserveMs);
    if (fromSitemap.length) {
      items = [...items, ...fromSitemap];
      source = source === "vazio" ? "paginas_de_produto" : source;
    }
  }

  // 4. páginas principais: texto para as políticas, o resumo da empresa e (se preciso) os itens
  const texts: PageText[] = [];
  if (isHtml) {
    const first = htmlToText(home.html);
    texts.push({ url: base, title: first.title, text: first.text.slice(0, 9_000) });
    const links = sameSiteLinks(home.html, base, 60)
      .filter((l) => sameSite(l, base) && PRIORITY.test(l))
      .slice(0, LIMITS.textPages);
    if (left() > LIMITS.aiReserveMs + 3_000) {
      const more = await pool(links, LIMITS.parallel, async (link) => {
        if (left() < LIMITS.aiReserveMs) return null;
        const r = await get(link);
        if (!r || !sameSite(r.url, base) || !/html/i.test(r.type)) return null;
        const t = htmlToText(r.html);
        // página de serviços ou de preços com dados estruturados também conta
        const extra = pageItems(r.html, r.url);
        return { page: { url: r.url, title: t.title, text: t.text.slice(0, 6_000) }, extra };
      });
      for (const m of more) {
        if (!m) continue;
        if (m.page.text.length > 120) texts.push(m.page);
        if (m.extra.length && items.length < MAX_ITEMS) {
          items = [...items, ...m.extra];
          if (source === "vazio") source = "dados_da_pagina";
        }
      }
    }
  }

  const corpus = corpusOf(texts);
  const textChars = texts.reduce((n, p) => n + p.text.length, 0);
  if (deps.ai && textChars > 200 && left() > 6_000) {
    try {
      const raw = await deps.ai({ system: AI_SYSTEM, text: corpus, schema: AI_SCHEMA });
      const g = groundAiResult(raw, corpus);
      company = mergeCompany(company, g.company);
      // a empresa declarou pouco sobre si: o resumo da IA é melhor que a descrição de SEO
      if (g.company.sells) company = { ...company, sells: g.company.sells };
      if (!fromStore && items.length < LIMITS.goodEnough && g.items.length) {
        items = [...items, ...g.items];
        if (source === "vazio") source = "leitura_por_ia";
      }
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      notes.push(
        /crédit|402/i.test(why)
          ? "A leitura inteligente não rodou porque o crédito de IA do projeto acabou. Veio só o que o site publica de forma organizada."
          : "A leitura inteligente das páginas não respondeu a tempo. Veio só o que o site publica de forma organizada.",
      );
    }
  } else if (!deps.ai && items.length < LIMITS.goodEnough) {
    notes.push(
      "A leitura inteligente das páginas está desligada: veio só o que o site publica de forma organizada.",
    );
  }

  const before = items.length;
  items = dedupeItems(items, MAX_ITEMS);
  if (before > MAX_ITEMS)
    notes.push(
      `A loja tem mais itens: mostrando os primeiros ${MAX_ITEMS}. O resto pode vir por planilha.`,
    );
  if (!items.length) source = "vazio";
  const thin = !items.length && textChars < 400;
  if (thin)
    notes.push(
      "Veio pouco ou nada: este site monta o conteúdo no navegador ou bloqueia leitura automática. Cole aqui o texto do que vocês vendem ou envie uma planilha ou arquivo.",
    );
  else if (!items.length)
    notes.push(
      "Li o site, mas não achei uma lista de produtos ou serviços com nome claro. Você pode colar a lista aqui ou enviar uma planilha.",
    );
  else if (items.every((i) => i.price === null))
    notes.push("O site não mostra preços: os itens entram sem preço e o atendente não fala valor.");

  return { url: base, source, items, company, pages: pagesRead, notes, thin };
}

async function readSitemapProducts(
  origin: string,
  get: (url: string, accept?: string) => Promise<Fetched | null>,
  left: () => number,
): Promise<SiteItem[]> {
  const root = await get(`${origin}/sitemap.xml`, XML_ACCEPT);
  if (!root || !/<(urlset|sitemapindex)[\s>]/i.test(root.html)) return [];
  const first = parseSitemap(root.html);
  let urls = first.index ? [] : first.urls;
  if (first.index) {
    for (const child of rankSitemaps(first.urls).slice(0, LIMITS.sitemaps)) {
      if (left() < 4_000) break;
      if (!sameSite(child, origin)) continue;
      const r = await get(child, XML_ACCEPT);
      if (r) urls = [...urls, ...parseSitemap(r.html).urls];
      if (productUrls(urls, origin, LIMITS.productPages).length >= LIMITS.productPages) break;
    }
  }
  const targets = productUrls(urls, origin, LIMITS.productPages);
  const found = await pool(targets, LIMITS.parallel, async (u) => {
    if (left() < 2_000) return [];
    const r = await get(u);
    return r && sameSite(r.url, origin) ? pageItems(r.html, r.url).slice(0, 3) : [];
  });
  return found.flat();
}
