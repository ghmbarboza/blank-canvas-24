import { describe, expect, it } from "vitest";

import { GUIDES, guideUrl, newWebhookToken } from "./guides";
import { RETIRED_PROVIDERS, VISIBLE_PROVIDERS } from "./providers";

describe("roteiro das integrações", () => {
  it("todo provedor tem roteiro de onde pegar a chave, com passos e link", () => {
    for (const p of VISIBLE_PROVIDERS) {
      const g = GUIDES[p.id];
      expect(g, p.id).toBeDefined();
      expect(g!.steps.length, p.id).toBeGreaterThanOrEqual(3);
      expect(g!.signupUrl, p.id).toMatch(/^https:\/\//);
      expect(g!.what.length, p.id).toBeGreaterThan(20);
    }
  });

  it("provedor retirado não tem roteiro (a tela não oferece mais)", () => {
    for (const id of RETIRED_PROVIDERS) expect(GUIDES[id], id).toBeUndefined();
  });

  it("campo gerado pela Central de CS existe no provedor e é segredo (vai para o cofre)", () => {
    for (const p of VISIBLE_PROVIDERS) {
      for (const k of GUIDES[p.id]?.autoFields ?? []) {
        const f = p.fields.find((x) => x.key === k);
        expect(f, `${p.id}.${k}`).toBeDefined();
        expect(f!.secret, `${p.id}.${k}`).toBe(true);
      }
    }
  });

  it("URLs só usam base, conta, formulário ou campos do próprio provedor", () => {
    for (const p of VISIBLE_PROVIDERS) {
      const known = new Set(["base", "account", "form", ...p.fields.map((f) => f.key)]);
      for (const u of GUIDES[p.id]?.urls ?? []) {
        for (const m of u.template.matchAll(/\{([a-z_]+)\}/g))
          expect(known.has(m[1]!), `${p.id}: {${m[1]}}`).toBe(true);
        expect(u.template.startsWith("{base}/api/public/"), p.id).toBe(true);
      }
    }
  });
});

describe("guideUrl", () => {
  it("monta a URL completa sem barra dupla", () => {
    const r = guideUrl("{base}/api/public/zapsign?account={account}&t={webhook_token}", {
      base: "https://central.empresa.com.br/",
      account: "acc-1",
      values: { webhook_token: "tok" },
    });
    expect(r).toEqual({
      url: "https://central.empresa.com.br/api/public/zapsign?account=acc-1&t=tok",
      missing: [],
    });
  });

  it("aponta o que falta (ex.: formulário ainda não escolhido)", () => {
    const r = guideUrl("{base}/api/public/meta-leads?account={account}&form={form}", {
      base: "https://x.app",
      account: "a",
      form: null,
    });
    expect(r.missing).toEqual(["form"]);
  });
});

describe("newWebhookToken", () => {
  it("gera 24 caracteres sem letras ambíguas e diferentes a cada vez", () => {
    const a = newWebhookToken();
    expect(a).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{24}$/);
    expect(newWebhookToken()).not.toBe(a);
  });
});
