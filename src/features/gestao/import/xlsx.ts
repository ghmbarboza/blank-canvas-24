// Leitor mínimo de XLSX (primeira planilha) sem dependência: lê o ZIP, descompacta com o
// DecompressionStream do navegador e extrai as células como texto. Suficiente para planilhas de
// contato e exportações de CRM; fórmulas viram o valor calculado que o Excel gravou.

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

function readEntries(buf: Uint8Array): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i -= 1) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo não parece um XLSX (ZIP inválido).");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== CEN) throw new Error("Índice do XLSX corrompido.");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compressedSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(data));
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(e.offset, true) !== LOC) throw new Error("Entrada do XLSX corrompida.");
  const nameLen = view.getUint16(e.offset + 26, true);
  const extraLen = view.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compressedSize);
  let bytes: Uint8Array;
  if (e.method === 0) bytes = raw;
  else if (e.method === 8) bytes = await inflateRaw(raw);
  else throw new Error("Compressão do XLSX não suportada. Salve de novo como .xlsx ou .csv.");
  return new TextDecoder().decode(bytes);
}

export function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textOf(fragment: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += m[1] ?? "";
  return decodeXml(out);
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(textOf(m[1] ?? ""));
  return out;
}

export function columnIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] ?? "A").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let next = 0;
    while ((cm = cellRe.exec(rm[1] ?? ""))) {
      const attrs = cm[1] ?? "";
      const body = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d*"/i)?.[1];
      const idx = ref ? columnIndex(ref) : next;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "b") value = v === "1" ? "Sim" : "Não";
      else value = v !== undefined ? decodeXml(v) : "";
      while (cells.length < idx) cells.push("");
      cells[idx] = value;
      next = idx + 1;
    }
    rows.push(cells);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Lê a primeira planilha de um .xlsx e devolve linhas de texto (a primeira é o cabeçalho). */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const entries = readEntries(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const sheets = entries
    .map((e) => e.name)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const first = sheets[0];
  if (!first) throw new Error("Não achei nenhuma planilha dentro do arquivo.");
  const ss = byName.get("xl/sharedStrings.xml");
  const shared = ss ? parseSharedStrings(await readEntry(buf, ss)) : [];
  return parseSheet(await readEntry(buf, byName.get(first)!), shared);
}

/** Converte número de série do Excel (dias desde 1899-12-30) para YYYY-MM-DD. */
export function excelSerialToDate(v: string): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const ms = Math.round((n - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}
