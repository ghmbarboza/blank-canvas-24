import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { columnIndex, decodeXml, excelSerialToDate, parseSheet, readXlsx } from "./xlsx";

// Monta um ZIP mínimo (método 8 = deflate e 0 = sem compressão) como o Excel grava.
function zip(files: Record<string, string>, stored: string[] = []): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(content);
    const isStored = stored.includes(name);
    const data = isStored ? raw : new Uint8Array(deflateRawSync(raw));
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, isStored ? 0 : 8, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, isStored ? 0 : 8, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cenSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

const SHARED = `<?xml version="1.0"?><sst><si><t>Nome</t></si><si><t>E-mail</t></si><si><r><t>Ana </t></r><r><t>Souza</t></r></si><si><t>ana@x.com.br</t></si><si><t xml:space="preserve">Café &amp; Cia</t></si></sst>`;
const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Valor</t></is></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>4</v></c><c r="D2"><v>1500.5</v></c></row>
<row r="3"><c r="A3"/></row>
</sheetData></worksheet>`;

describe("leitor de XLSX", () => {
  it("lê a primeira planilha com textos compartilhados, texto embutido e número", async () => {
    const rows = await readXlsx(
      zip({
        "xl/sharedStrings.xml": SHARED,
        "xl/worksheets/sheet1.xml": SHEET,
        "xl/worksheets/sheet2.xml": "<x/>",
      }),
    );
    expect(rows).toEqual([
      ["Nome", "E-mail", "", "Valor"],
      ["Ana Souza", "ana@x.com.br", "Café & Cia", "1500.5"],
    ]);
  });

  it("aceita entrada sem compressão", async () => {
    const rows = await readXlsx(
      zip(
        {
          "xl/worksheets/sheet1.xml": `<row r="1"><c r="B1" t="inlineStr"><is><t>oi</t></is></c></row>`,
        },
        ["xl/worksheets/sheet1.xml"],
      ),
    );
    expect(rows).toEqual([["", "oi"]]);
  });

  it("recusa arquivo que não é ZIP com mensagem clara", async () => {
    await expect(readXlsx(new TextEncoder().encode("nome;email\n"))).rejects.toThrow("XLSX");
  });

  it("utilitários", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("AA")).toBe(26);
    expect(decodeXml("&lt;b&gt; &#233; &#x41;")).toBe("<b> é A");
    expect(excelSerialToDate("46000")).toBe("2025-12-09");
    expect(excelSerialToDate("12")).toBeNull();
    expect(parseSheet(`<row><c t="b"><v>1</v></c></row>`, [])).toEqual([["Sim"]]);
  });
});
