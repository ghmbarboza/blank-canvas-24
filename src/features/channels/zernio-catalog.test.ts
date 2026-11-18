import { describe, expect, it } from "vitest";

import {
  ZERNIO_OPTIONS,
  findOption,
  isAdsPlatform,
  isServiceChannelPlatform,
  optionStates,
} from "./zernio-catalog";

describe("tudo pela chave única da Zernio", () => {
  it("cobre mensagens, redes e as 8 redes de anúncio, sem id repetido", () => {
    const ids = ZERNIO_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "whatsapp",
      "instagram",
      "facebook",
      "metaads",
      "googleads",
      "tiktokads",
      "linkedinads",
      "microsoftads",
    ])
      expect(findOption(id)).toBeTruthy();
    expect(ZERNIO_OPTIONS.filter((o) => o.group === "anuncios")).toHaveLength(8);
  });
  it("Meta Ads abre o cadastro de anúncios do Facebook; Google Ads é conexão própria", () => {
    expect(findOption("metaads")!.connect).toEqual({ kind: "ads", platform: "facebook" });
    expect(findOption("googleads")!.connect).toEqual({ kind: "ads", platform: "googleads" });
    expect(findOption("whatsapp")!.connect).toEqual({ kind: "whatsapp" });
  });
  it("conta de anúncio não é canal de atendimento", () => {
    expect(isAdsPlatform("metaads")).toBe(true);
    expect(isAdsPlatform("googleads")).toBe(true);
    expect(isAdsPlatform("instagram")).toBe(false);
  });
  it("marca conectado, com problema ou não conectado pelo que a Zernio devolve", () => {
    const s = optionStates([
      { id: "1", platform: "instagram", name: "@clinica", active: true },
      { id: "2", platform: "metaads", name: "Conta de anúncios", active: false },
    ]);
    const by = Object.fromEntries(s.map((x) => [x.option.id, x]));
    expect(by["instagram"]!.status).toBe("connected");
    expect(by["instagram"]!.accounts[0]!.name).toBe("@clinica");
    expect(by["metaads"]!.status).toBe("problem");
    expect(by["googleads"]!.status).toBe("none");
  });
  it("Google e Microsoft entram pela Zernio só com agenda e e-mail, sem virar canal", () => {
    expect(findOption("google")!.connect).toEqual({
      kind: "workspace",
      platform: "google",
      scopes: "email,calendar",
    });
    expect(findOption("microsoft")!.connect).toEqual({
      kind: "workspace",
      platform: "microsoft",
      scopes: "email,calendar",
    });
    expect(ZERNIO_OPTIONS.filter((o) => o.group === "agenda")).toHaveLength(2);
    expect(isServiceChannelPlatform("google")).toBe(false);
    expect(isServiceChannelPlatform("microsoft")).toBe(false);
    expect(isServiceChannelPlatform("metaads")).toBe(false);
    expect(isServiceChannelPlatform("instagram")).toBe(true);
    expect(isServiceChannelPlatform("whatsapp")).toBe(true);
  });
});
