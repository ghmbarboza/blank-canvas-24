// Trechos da base de conhecimento para o RAG (sem rede). Cada trecho leva o título do artigo e a
// seção onde está ("Título › Seção"), para o vetor saber do que o pedaço fala, e sobrepõe o fim do
// trecho anterior, para uma resposta que cai na divisa não ficar cortada ao meio.

export interface KbChunkInput {
  title: string;
  category?: string | null;
  body: string;
}

export const CHUNK_MAX = 1200;
export const CHUNK_OVERLAP = 200;
export const MAX_CHUNKS = 60;

const HEADING = /^#{1,6}\s+(.+)$/;

/** Blocos do markdown com a seção em que cada um está. */
function blocks(md: string): { section: string; text: string }[] {
  const out: { section: string; text: string }[] = [];
  let section = "";
  for (const raw of md.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = raw.split("\n");
    const rest: string[] = [];
    for (const l of lines) {
      const h = HEADING.exec(l.trim());
      if (h) section = h[1]!.trim();
      else rest.push(l);
    }
    const text = rest.join("\n").trim();
    if (text) out.push({ section, text });
  }
  return out;
}

/** Pedaços de até `max`, cortando em frase quando o bloco é maior. */
function pieces(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const s of text.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [text]) {
    if ((cur + s).length > max && cur.trim()) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max)
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** Fim do trecho anterior, começando numa palavra inteira. */
function tail(text: string, n: number): string {
  if (text.length <= n) return text;
  const t = text.slice(-n);
  const sp = t.indexOf(" ");
  return sp >= 0 ? t.slice(sp + 1) : t;
}

export function chunkArticle(a: KbChunkInput, max = CHUNK_MAX, overlap = CHUNK_OVERLAP): string[] {
  const title = a.title.trim();
  const prefix = (section: string) =>
    [title, section && section !== title ? section : ""].filter(Boolean).join(" › ");
  const out: string[] = [];
  let cur = "";
  let curSection = "";
  const flush = () => {
    if (!cur.trim()) return;
    out.push(`${prefix(curSection)}\n${cur.trim()}`);
    cur = tail(cur.trim(), overlap);
  };
  for (const b of blocks(a.body)) {
    if (b.section !== curSection && cur.trim()) {
      flush();
      cur = ""; // seção nova não herda o fim da anterior
    }
    curSection = b.section;
    for (const p of pieces(b.text, max)) {
      if ((cur ? cur.length + 2 : 0) + p.length > max) flush();
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  flush();
  if (!out.length && title) out.push(title);
  return out.slice(0, MAX_CHUNKS);
}
