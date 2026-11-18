import { describe, expect, it } from "vitest";

import {
  enrollScopeError,
  escapeLike,
  isManagerRole,
  portalEligible,
  portalLinkHtml,
  publicBookingJoinUrl,
} from "./contact-trust";

describe("papéis", () => {
  it("dono, admin e gestor são gestores; atendente e vendedor não", () => {
    expect(["owner", "admin", "manager"].every(isManagerRole)).toBe(true);
    expect(isManagerRole("agent")).toBe(false);
    expect(isManagerRole("seller")).toBe(false);
  });
});

describe("inscrição em automação (R4)", () => {
  it("atendente não inscreve segmento", () => {
    expect(enrollScopeError("agent", { contactIds: 0, usesSegment: true })).toMatch(/segmento/);
  });
  it("atendente não inscreve lote", () => {
    expect(enrollScopeError("agent", { contactIds: 2, usesSegment: false })).toMatch(/vários/);
    expect(enrollScopeError("seller", { contactIds: 5000, usesSegment: false })).not.toBeNull();
  });
  it("atendente inscreve um contato só", () => {
    expect(enrollScopeError("agent", { contactIds: 1, usesSegment: false })).toBeNull();
  });
  it("gestor inscreve lote e segmento", () => {
    expect(enrollScopeError("manager", { contactIds: 5000, usesSegment: true })).toBeNull();
  });
});

describe("agendamento público (R3)", () => {
  it("contato que já existia: sem link da sala na resposta", () => {
    expect(
      publicBookingJoinUrl({ matchedExisting: true, meetingId: "m1", guestToken: "abc" }),
    ).toBeNull();
  });
  it("contato novo recebe o próprio link", () => {
    expect(
      publicBookingJoinUrl({ matchedExisting: false, meetingId: "m1", guestToken: "abc" }),
    ).toBe("/sala/m1?t=abc");
  });
  it("sem token, sem link", () => {
    expect(
      publicBookingJoinUrl({ matchedExisting: false, meetingId: "m1", guestToken: null }),
    ).toBeNull();
  });
});

describe("busca literal no ilike", () => {
  it("% _ e barra invertida do texto digitado não viram curinga", () => {
    expect(escapeLike("fulano@x.com")).toBe("fulano@x.com");
    expect(escapeLike("%@x.com")).toBe("\\%@x.com");
    expect(escapeLike("a_b\\c")).toBe("a\\_b\\\\c");
  });
});

describe("portal do cliente (R7)", () => {
  it("contato do chat do site (anônimo) não recebe link mágico", () => {
    expect(portalEligible("webchat")).toBe(false);
    expect(portalEligible("form")).toBe(true);
    expect(portalEligible(null)).toBe(true);
  });
  it("nome e empresa entram escapados no HTML", () => {
    const html = portalLinkHtml({
      first: '<a href="https://mal.example">clique</a>',
      accountName: "Loja <b>&</b>",
      link: "https://app.example/portal/x?acesso=t",
    });
    expect(html).not.toContain('<a href="https://mal.example">');
    expect(html).toContain("&lt;a href=&quot;https://mal.example&quot;&gt;");
    expect(html).toContain("Loja &lt;b&gt;&amp;&lt;/b&gt;");
    expect(html).toContain('href="https://app.example/portal/x?acesso=t"');
  });
});
