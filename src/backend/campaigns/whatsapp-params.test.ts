import { describe, expect, it } from "vitest";

import { renderCampaignParams } from "./whatsapp-params";

describe("renderCampaignParams", () => {
  it("{nome} é o primeiro nome e {nome_completo} o nome inteiro", () => {
    expect(
      renderCampaignParams(["{nome}", "Olá {nome_completo}!", "20%"], "Ana Paula Souza"),
    ).toEqual(["Ana", "Olá Ana Paula Souza!", "20%"]);
  });
  it("sem nome, a variável nunca vai vazia", () => {
    expect(renderCampaignParams(["{nome}"], null)).toEqual(["cliente"]);
    expect(renderCampaignParams(["{nome}"], "  ")).toEqual(["cliente"]);
  });
});
