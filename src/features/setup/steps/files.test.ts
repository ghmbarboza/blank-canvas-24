import { describe, expect, it } from "vitest";

import { MAX_BYTES, sortFiles } from "./files";

describe("arquivos da base de conhecimento", () => {
  it("aceita PDF, Word e texto", () => {
    const r = sortFiles([
      { name: "Garantia.PDF", size: 10 },
      { name: "troca.docx", size: 10 },
      { name: "faq.txt", size: 10 },
    ]);
    expect(r.ok).toHaveLength(3);
    expect(r.refused).toEqual([]);
  });

  it("recusa formato errado, arquivo grande e arquivo vazio, dizendo o motivo", () => {
    const r = sortFiles([
      { name: "foto.png", size: 10 },
      { name: "manual.pdf", size: MAX_BYTES + 1 },
      { name: "vazio.txt", size: 0 },
    ]);
    expect(r.ok).toEqual([]);
    expect(r.refused).toEqual([
      "foto.png: use PDF, Word (.docx) ou texto (.txt)",
      "manual.pdf: passa de 20 MB, divida o arquivo",
      "vazio.txt: o arquivo está vazio",
    ]);
  });
});
