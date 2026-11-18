// Busca e leitura da web para a Nexa: ler o site do cliente, navegar algumas páginas e pesquisar.
// Proteção contra SSRF: só http(s), nada de rede interna (checado também depois de resolver o DNS).
import { lookup } from "node:dns/promises";

import { htmlToText, isPrivateHost, parseDuckResults, sameSiteLinks } from "./text";

const UA = "Mozilla/5.0 (compatible; VinculoBot/1.0)";
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;

async function assertPublic(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("só endereços http ou https");
  if (isPrivateHost(url.hostname)) throw new Error("endereço interno bloqueado");
  const addrs = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`não achei o site ${url.hostname}`);
  if (addrs.some((a) => isPrivateHost(a.address))) throw new Error("endereço interno bloqueado");
}

async function fetchText(raw: string): Promise<{ url: string; html: string; type: string }> {
  let url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  // segue até 4 redirecionamentos checando cada destino
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new Error(`o site respondeu ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error("página grande demais");
    return { url: url.toString(), html: new TextDecoder().decode(buf), type };
  }
  throw new Error("redirecionamentos demais");
}

export async function readPage(raw: string) {
  const { url, html, type } = await fetchText(raw);
  if (!/html|text\/plain/i.test(type)) throw new Error(`não é uma página de texto (${type})`);
  const { title, text } = /html/i.test(type) ? htmlToText(html) : { title: "", text: html };
  return {
    url,
    title,
    text: text.slice(0, 20_000),
    links: /html/i.test(type) ? sameSiteLinks(html, url) : [],
  };
}

/** Lê a página inicial e até `max` páginas do mesmo site (serviços, preços, contato, sobre). */
export async function crawlSite(raw: string, max = 6) {
  const first = await readPage(raw);
  const priority =
    /servi|produt|preco|preço|plano|sobre|quem|contato|atend|faq|duvid|tratament|curso|imove|loja/i;
  const next = [...first.links].sort((a, b) => Number(priority.test(b)) - Number(priority.test(a)));
  const pages = [{ url: first.url, title: first.title, text: first.text }];
  for (const link of next.slice(0, Math.max(0, max - 1))) {
    try {
      const p = await readPage(link);
      if (p.text.length > 200)
        pages.push({ url: p.url, title: p.title, text: p.text.slice(0, 8_000) });
    } catch {
      // página que não abre não derruba a leitura do site
    }
  }
  return pages;
}

export async function webSearch(query: string) {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) throw new Error("pesquisa vazia");
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=br-pt`, {
    headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`a pesquisa respondeu ${res.status}`);
  return parseDuckResults(await res.text());
}
