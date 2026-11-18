import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHANNELS,
  absoluteLink,
  notificationEmail,
  pushPayload,
  resolveChannels,
} from "./delivery";

describe("resolveChannels", () => {
  const rows = [
    { kind: "*", app: true, email: true, push: false },
    { kind: "lead_hot", app: false, email: false, push: true },
  ];
  it("tipo específico ganha do padrão da pessoa", () => {
    expect(resolveChannels(rows, "lead_hot")).toEqual({ app: false, email: false, push: true });
  });
  it("sem linha do tipo usa o padrão da pessoa", () => {
    expect(resolveChannels(rows, "sla_breached")).toEqual({ app: true, email: true, push: false });
  });
  it("sem nada gravado usa o padrão do sistema", () => {
    expect(resolveChannels([], "x")).toEqual(DEFAULT_CHANNELS);
  });
});

describe("absoluteLink", () => {
  it("só aceita caminho interno", () => {
    expect(absoluteLink("/crm?negocio=1", "https://app.x/")).toBe("https://app.x/crm?negocio=1");
    expect(absoluteLink("https://mal.com", "https://app.x")).toBeNull();
    expect(absoluteLink("//mal.com", "https://app.x")).toBeNull();
    expect(absoluteLink(null, "https://app.x")).toBeNull();
  });
});

describe("notificationEmail", () => {
  it("escapa HTML, neutraliza variáveis e põe o botão", () => {
    const e = notificationEmail(
      { title: "Lead <b>quente</b> {{nome}}", body: "linha 1\nlinha 2", link: "/contatos/1" },
      "https://app.x",
    );
    expect(e.html).toContain("Lead &lt;b&gt;quente&lt;/b&gt;");
    expect(e.html).not.toContain("{{");
    expect(e.html).toContain("linha 1<br>linha 2");
    expect(e.html).toContain('href="https://app.x/contatos/1"');
    expect(e.subject).toBe("Lead <b>quente</b> { {nome} }");
    expect(e.text).toContain("https://app.x/contatos/1");
  });
  it("sem link não tem botão", () => {
    expect(
      notificationEmail({ title: "Oi", body: null, link: null }, "https://app.x").html,
    ).not.toContain("Abrir no Vínculo");
  });
});

describe("pushPayload", () => {
  it("corta textos e cai na raiz do app sem link", () => {
    const p = pushPayload(
      { id: "n1", kind: "info", title: "x".repeat(200), body: null, link: null },
      "https://app.x",
    );
    expect(p.title.length).toBe(120);
    expect(p.url).toBe("https://app.x");
    expect(p.tag).toBe("info:n1");
  });
});
