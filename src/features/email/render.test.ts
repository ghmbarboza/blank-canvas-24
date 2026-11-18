import { describe, expect, it } from "vitest";

import { analyzeDns, healthLevel, warmupLimit } from "./dns";
import {
  blocksToHtml,
  contactVars,
  htmlToText,
  isAllowedRedirect,
  renderVariables,
  withTracking,
  UNSUB_TOKEN,
} from "./render";

const base = "https://app.test";

describe("e-mail: lições da EasyCover viram teste", () => {
  it("bug 2: todo e-mail sai com o pixel de abertura", () => {
    const { html } = withTracking("<html><body><p>oi</p></body></html>", {
      base,
      messageId: "m1",
      unsubscribeUrl: null,
    });
    expect(html).toContain(`${base}/api/public/email/o/m1`);
  });

  it("bug 6: {{unsubscribe_url}} é trocado pelo link assinado, nunca sai literal", () => {
    const tpl = blocksToHtml([{ id: "1", type: "text", text: "oi" }], {
      brand: { name: "X" },
      marketing: true,
    });
    expect(tpl).toContain(UNSUB_TOKEN);
    const { html } = withTracking(tpl, {
      base,
      messageId: "m1",
      unsubscribeUrl: `${base}/api/public/email/unsubscribe?a=1&e=x&h=abc`,
    });
    expect(html).not.toContain("{{unsubscribe_url}}");
    expect(html).toContain("/api/public/email/unsubscribe?a=1&amp;e=x&amp;h=abc");
  });

  it("marketing sem descadastro no modelo ganha rodapé de descadastro", () => {
    const { html } = withTracking("<html><body><p>oi</p></body></html>", {
      base,
      messageId: "m1",
      unsubscribeUrl: "https://u",
    });
    expect(html).toContain("Não quero mais receber");
    expect(html).toContain('href="https://u"');
  });

  it("variável sem valor barra o envio (não sai 'Olá {{nome}}')", () => {
    const r = renderVariables("Olá {{primeiro_nome}}, da {{empresa}}", {
      primeiro_nome: "Ana",
      empresa: "",
    });
    expect(r.missing).toEqual(["empresa"]);
    const ok = renderVariables("Olá {{primeiro_nome | cliente}}", { primeiro_nome: "" });
    expect(ok.missing).toEqual([]);
    expect(ok.out).toBe("Olá cliente");
  });

  it("variável é escapada no HTML (sem injeção pelo nome do contato)", () => {
    expect(renderVariables("Oi {{nome}}", { nome: "<script>" }).out).toBe("Oi &lt;script&gt;");
  });

  it("rastreio reescreve links, guarda destino e CTA, sem embrulhar o próprio rastreio", () => {
    const src = `<a href="https://site.com/a?x=1&amp;y=2">Comprar agora</a><a href="${base}/x">já rastreado</a>`;
    const { html, links } = withTracking(src, { base, messageId: "m9", unsubscribeUrl: null });
    expect(links).toEqual(["https://site.com/a?x=1&y=2"]);
    expect(html).toContain(
      `${base}/api/public/email/c/m9?u=${encodeURIComponent("https://site.com/a?x=1&y=2")}&amp;c=Comprar%20agora`,
    );
    expect(html).toContain(`href="${base}/x"`);
  });

  it("clique só redireciona para link que estava no e-mail (sem redirecionamento aberto)", () => {
    expect(isAllowedRedirect("https://site.com", ["https://site.com"])).toBe(true);
    expect(isAllowedRedirect("https://evil.com", ["https://site.com"])).toBe(false);
    expect(isAllowedRedirect("javascript:alert(1)", ["javascript:alert(1)"])).toBe(false);
  });

  it("variáveis do contato incluem primeiro nome e campos personalizados", () => {
    const v = contactVars(
      { name: "Ana Maria Souza", custom: { plano: "Pro", lista: ["x"] } },
      "Bia",
    );
    expect(v["primeiro_nome"]).toBe("Ana");
    expect(v["campo.plano"]).toBe("Pro");
    expect(v["campo.lista"]).toBeUndefined();
    expect(v["vendedor"]).toBe("Bia");
  });

  it("bloco com URL que não é http é descartado (sem javascript:)", () => {
    const html = blocksToHtml(
      [{ id: "b", type: "button", text: "x", url: "javascript:alert(1)" }],
      {
        brand: { name: "X" },
        marketing: false,
      },
    );
    expect(html).not.toContain("javascript:");
  });

  it("versão texto mantém o link visível", () => {
    expect(htmlToText('<p>Oi</p><a href="https://a.com">site</a>')).toContain(
      "site (https://a.com)",
    );
  });
});

describe("entregabilidade", () => {
  it("três SPF = permerror; DMARC ausente aparece", () => {
    const r = analyzeDns({
      spf: ["v=spf1 include:a ~all", "v=spf1 include:b ~all", "v=spf1 -all"],
      dkim: [],
      dmarc: [],
      mx: [],
    });
    expect(r.spf.ok).toBe(false);
    expect(r.spf.problem).toContain("3 registros SPF");
    expect(r.dmarc.ok).toBe(false);
    expect(r.ok).toBe(false);
  });
  it("domínio certo passa", () => {
    const r = analyzeDns({
      spf: ["v=spf1 include:amazonses.com ~all"],
      dkim: ["p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1234567890abcdefghijklmnop"],
      dmarc: ["v=DMARC1; p=quarantine; rua=mailto:d@x.com"],
      mx: ["10 feedback-smtp.us-east-1.amazonses.com"],
    });
    expect(r.ok).toBe(true);
    expect(r.dmarc.policy).toBe("quarantine");
  });
  it("aquecimento sobe por degraus e libera depois", () => {
    const start = new Date("2026-10-01T00:00:00Z").toISOString();
    expect(warmupLimit(null)).toBe(200);
    expect(warmupLimit(start, new Date("2026-10-01T12:00:00Z"))).toBe(200);
    expect(warmupLimit(start, new Date("2026-10-03T12:00:00Z"))).toBe(1000);
    expect(warmupLimit(start, new Date("2026-10-20T12:00:00Z"))).toBe(Number.POSITIVE_INFINITY);
  });
  it("taxa de spam: alerta em 0,1% e teto em 0,3%", () => {
    expect(healthLevel(0.0005, 0.001, 0.003)).toBe("ok");
    expect(healthLevel(0.0015, 0.001, 0.003)).toBe("warn");
    expect(healthLevel(0.004, 0.001, 0.003)).toBe("bad");
  });
});
