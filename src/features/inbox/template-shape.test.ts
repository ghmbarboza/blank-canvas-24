import { describe, expect, it } from "vitest";

import { fillPreview, slotLabel, templateShape } from "./template-shape";

// Formatos tirados de modelos aprovados reais (conta de clínica na Zernio, 27/10/2026), sem o texto original.
describe("templateShape", () => {
  it("modelo só com corpo e {{1}} vira um campo do corpo", () => {
    const s = templateShape([
      { type: "BODY", text: "Olá {{1}}, sua consulta está confirmada." },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Ok" }] },
    ]);
    expect(s.slots).toEqual([{ where: "corpo", name: "1" }]);
    expect(s.unsupported).toBeNull();
  });

  it("cabeçalho com imagem ou vídeo fica bloqueado com motivo claro", () => {
    for (const format of ["IMAGE", "VIDEO"]) {
      const s = templateShape([
        { type: "HEADER", format },
        { type: "BODY", text: "Oi" },
      ]);
      expect(s.unsupported).toMatch(/no topo/);
    }
  });

  it("ordem é cabeçalho, corpo e botão de link, como a Zernio espera", () => {
    const s = templateShape([
      { type: "HEADER", format: "TEXT", text: "Pedido {{1}}" },
      { type: "BODY", text: "{{2}} chega em {{1}} dias" },
      { type: "BUTTONS", buttons: [{ type: "URL", url: "https://x.com/r/{{1}}" }] },
    ]);
    expect(s.slots.map((x) => `${x.where}:${x.name}`)).toEqual([
      "cabeçalho:1",
      "corpo:1",
      "corpo:2",
      "botão:1",
    ]);
  });

  it("variáveis com nome seguem a ordem em que aparecem", () => {
    const s = templateShape([{ type: "BODY", text: "Oi {{nome}}, dia {{data}}. Até {{nome}}!" }]);
    expect(s.slots.map((x) => x.name)).toEqual(["nome", "data"]);
    expect(slotLabel(s.slots[0]!)).toBe("Variável nome");
  });

  it("prévia preenche o que tem valor e mantém o resto", () => {
    const s = templateShape([
      { type: "HEADER", format: "TEXT", text: "Oi {{1}}" },
      { type: "BODY", text: "Consulta {{1}} às {{2}}" },
    ]);
    expect(fillPreview(s, ["Ana", "terça", ""])).toBe("Oi Ana\n\nConsulta terça às {{2}}");
  });

  it("sem componentes não quebra", () => {
    expect(templateShape(undefined)).toEqual({
      header: "",
      body: "",
      slots: [],
      unsupported: null,
    });
  });
});
