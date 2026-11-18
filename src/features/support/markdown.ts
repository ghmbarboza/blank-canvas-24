// Markdown mínimo e seguro para a base de conhecimento: vira blocos tipados (nunca HTML cru).
export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "italic"; v: string }
  | { t: "code"; v: string }
  | { t: "link"; v: string; href: string };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; inline: Inline[] }
  | { t: "p"; inline: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "quote"; inline: Inline[] }
  | { t: "pre"; v: string };

export function safeHref(url: string): string | null {
  try {
    const u = new URL(url, "https://exemplo.invalid");
    if (!["http:", "https:", "mailto:", "tel:"].includes(u.protocol)) return null;
    return url.startsWith("/") || /^(https?:|mailto:|tel:)/.test(url) ? url : null;
  } catch {
    return null;
  }
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[2]) out.push({ t: "bold", v: m[2] });
    else if (m[4]) out.push({ t: "italic", v: m[4] });
    else if (m[6]) out.push({ t: "code", v: m[6] });
    else if (m[8]) {
      const href = safeHref(m[9]!);
      out.push(href ? { t: "link", v: m[8], href } : { t: "text", v: m[8] });
    }
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", inline: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      blocks.push({ t: "pre", v: code.join("\n") });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ t: "h", level: h[1]!.length as 1 | 2 | 3, inline: parseInline(h[2]!) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flush();
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: Inline[][] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, "")));
        i++;
      }
      i--;
      blocks.push(ordered ? { t: "ol", items } : { t: "ul", items });
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      blocks.push({ t: "quote", inline: parseInline(line.replace(/^>\s?/, "")) });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** Texto corrido de um markdown, sem marcação, para prévia de uma ou duas linhas. */
export function markdownExcerpt(src: string, max = 180): string {
  const plain = src
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}
