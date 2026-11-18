import { describe, expect, it } from "vitest";

import { buildSocialAutomation } from "./zernio-comments";

describe("automação de Instagram (comentário → DM)", () => {
  it("monta o corpo da Zernio com palavras-chave limpas e resposta pública", () => {
    const r = buildSocialAutomation(
      {
        keywords: "Preço, QUERO ,",
        dmMessage: "Oi {{first_name}}! Te mando os valores.",
        commentReply: "Te chamei no direct!",
      },
      "instagram",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toMatchObject({
      trigger: "comment",
      keywords: ["preço", "quero"],
      matchMode: "word",
      commentReply: "Te chamei no direct!",
      repeatPolicy: { mode: "once" },
    });
    expect(r.body.name).toBe("Comentário: preço, quero");
  });
  it("menção em story não tem palavra-chave; story só no Instagram", () => {
    expect(
      buildSocialAutomation(
        { trigger: "story_mention", keywords: "oi", dmMessage: "Valeu!" },
        "instagram",
      ),
    ).toMatchObject({ ok: false });
    expect(
      buildSocialAutomation(
        { trigger: "story_mention", dmMessage: "Valeu pela menção!" },
        "instagram",
      ),
    ).toMatchObject({ ok: true });
    expect(
      buildSocialAutomation({ trigger: "story_reply", keywords: "x", dmMessage: "oi" }, "facebook"),
    ).toMatchObject({ ok: false });
  });
  it("sem DM ou sem palavra-chave, explica o que falta", () => {
    expect(buildSocialAutomation({ keywords: "x", dmMessage: "" }, "instagram")).toMatchObject({
      ok: false,
    });
    expect(buildSocialAutomation({ dmMessage: "oi tudo bem" }, "instagram")).toMatchObject({
      ok: false,
    });
  });
});
