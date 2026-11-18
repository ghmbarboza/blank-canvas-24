// Texto para a IA e para a base de conhecimento. Puro (sem rede), testado.

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;|&#39;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
}

/** Página HTML → título + texto legível (sem script, estilo, menu e rodapé repetidos). */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim()).slice(
    0,
    200,
  );
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ");
  const text = decode(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { title, text };
}

/** Links da mesma origem, sem âncora nem arquivos, na ordem em que aparecem. */
export function sameSiteLinks(html: string, base: string, max = 30): string[] {
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1]!, origin);
      if (u.origin !== origin.origin) continue;
      if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?)$/i.test(u.pathname)) continue;
      u.hash = "";
      u.search = "";
      const s = u.toString();
      if (!out.includes(s) && s !== origin.toString()) out.push(s);
      if (out.length >= max) break;
    } catch {
      // link inválido: ignora
    }
  }
  return out;
}

/** Divide em trechos de até `max` caracteres, quebrando em parágrafo (bom para busca e para a IA). */
export function chunkText(text: string, max = 1800): string[] {
  const paras = text
    .split(/\n{2,}|\n(?=[•\-\d]+[.)]?\s)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > max) {
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      for (let i = 0; i < p.length; i += max) chunks.push(p.slice(i, i + max));
      continue;
    }
    if ((cur ? cur.length + 2 : 0) + p.length > max) {
      chunks.push(cur);
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Resultados da busca do DuckDuckGo (versão HTML, sem chave): título, link real e resumo. */
export function parseDuckResults(
  html: string,
  max = 8,
): { title: string; url: string; snippet: string }[] {
  const out: { title: string; url: string; snippet: string }[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const b of blocks) {
    const a = b.match(
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!a) continue;
    let href = decode(a[1]!);
    const real = href.match(/[?&]uddg=([^&]+)/);
    if (real) href = decodeURIComponent(real[1]!);
    if (href.startsWith("//")) href = `https:${href}`;
    if (!/^https?:\/\//.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
    const snip = b.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
    out.push({
      title: decode(a[2]!.replace(/<[^>]+>/g, "")).trim(),
      url: href,
      snippet: decode(snip.replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ")
        .trim(),
    });
    if (out.length >= max) break;
  }
  return out;
}

// Regra única de endereço interno (R8): a mesma do net-guard.server.ts.
export { isPrivateHost } from "../net-address";
