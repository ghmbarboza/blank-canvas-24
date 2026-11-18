import { describe, expect, it } from "vitest";

import { fillReply, filterReplies, slashQuery } from "./quickReplies";

describe("respostas rápidas", () => {
  it("só abre a lista quando a mensagem é um /atalho", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/Pix")).toBe("pix");
    expect(slashQuery("oi /pix")).toBeNull();
    expect(slashQuery("/pix agora")).toBeNull();
  });
  it("prioriza quem começa com o atalho", () => {
    const list = [
      { shortcut: "boleto", title: "Pix e boleto", body: "" },
      { shortcut: "pix", title: "Dados do Pix", body: "" },
    ];
    expect(filterReplies(list, "pi").map((r) => r.shortcut)).toEqual(["pix", "boleto"]);
  });
  it("troca {nome} pelo primeiro nome e arruma a pontuação sem nome", () => {
    expect(fillReply("Oi {nome}, tudo bem?", "Ana Souza")).toBe("Oi Ana, tudo bem?");
    expect(fillReply("Oi {nome}, tudo bem?", null)).toBe("Oi, tudo bem?");
  });
});
