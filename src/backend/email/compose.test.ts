import { describe, expect, it } from "vitest";

import { toBlocks } from "./compose";

describe("e-mail escrito pela IA vira blocos do editor", () => {
  it("mantém só os tipos conhecidos e limpa HTML", () => {
    const r = toBlocks(
      {
        subject: "<b>Oferta</b> de novembro",
        preheader: "Só até sexta",
        blocks: [
          { type: "heading", text: "Olá, {{primeiro_nome | tudo bem}}" },
          { type: "script", text: "alert(1)" },
          { type: "text", text: "Texto <img src=x onerror=alert(1)> limpo" },
          { type: "divider", text: "" },
        ],
      },
      null,
    );
    expect(r.subject).toBe("Oferta de novembro");
    expect(r.blocks.map((b) => b.type)).toEqual(["heading", "text", "divider"]);
    expect(r.blocks[1]!.text).toBe("Texto  limpo");
  });
  it("botão só com link https; sem link vira texto ou usa o site da empresa", () => {
    const semSite = toBlocks(
      { blocks: [{ type: "button", text: "Agendar", url: "javascript:x" }] },
      null,
    );
    expect(semSite.blocks[0]).toMatchObject({ type: "text", text: "Agendar" });
    const comSite = toBlocks(
      { blocks: [{ type: "button", text: "Agendar", url: "" }] },
      "https://clinica.com.br/agendar",
    );
    expect(comSite.blocks[0]).toMatchObject({
      type: "button",
      url: "https://clinica.com.br/agendar",
    });
  });
});
