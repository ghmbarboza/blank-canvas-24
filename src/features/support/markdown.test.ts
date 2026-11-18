import { describe, expect, it } from "vitest";

import { markdownExcerpt, parseInline, parseMarkdown, safeHref } from "./markdown";

describe("markdown da base de conhecimento", () => {
  it("monta títulos, listas e parágrafos", () => {
    const b = parseMarkdown(
      "# Pagar boleto\n\nAcesse a **área do cliente**.\n\n- Entre\n- Clique em 2ª via\n\n1. um\n2. dois",
    );
    expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "ol"]);
    expect(b[2]).toEqual({
      t: "ul",
      items: [[{ t: "text", v: "Entre" }], [{ t: "text", v: "Clique em 2ª via" }]],
    });
  });
  it("links só com esquema seguro", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://a.com")).toBe("https://a.com");
    expect(parseInline("[x](javascript:alert(1))")).toEqual([
      { t: "text", v: "x" },
      { t: "text", v: ")" },
    ]);
    expect(parseInline("veja [aqui](https://a.com)")).toEqual([
      { t: "text", v: "veja " },
      { t: "link", v: "aqui", href: "https://a.com" },
    ]);
  });
  it("bloco de código não interpreta formatação", () => {
    expect(parseMarkdown("```\n**não**\n```")).toEqual([{ t: "pre", v: "**não**" }]);
  });
});

describe("markdownExcerpt", () => {
  it("tira a marcação e mantém o texto do link", () => {
    expect(
      markdownExcerpt("# Título\n\n**Reinicie** a [maquininha](https://x.y) e\n- tente de novo"),
    ).toBe("Título Reinicie a maquininha e tente de novo");
  });
  it("corta no limite com reticências", () => {
    expect(markdownExcerpt("a".repeat(50), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
