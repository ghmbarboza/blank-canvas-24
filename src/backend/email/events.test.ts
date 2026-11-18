import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isOneClickBody, parseAddress, stripQuoted, verifySvix } from "./events.server";

describe("eventos de e-mail", () => {
  it("bug 7: descadastro só no POST do botão ou do one-click (GET de antivírus não descadastra)", () => {
    expect(isOneClickBody("List-Unsubscribe=One-Click")).toBe(true);
    expect(isOneClickBody("confirmar=1")).toBe(true);
    expect(isOneClickBody("")).toBe(false);
    expect(isOneClickBody('{"type":"email.bounced"}')).toBe(false);
  });

  it("lê remetente com nome e sem nome", () => {
    expect(parseAddress('"Ana Souza" <Ana@Empresa.com>')).toEqual({
      email: "ana@empresa.com",
      name: "Ana Souza",
    });
    expect(parseAddress("joao@x.com")).toEqual({ email: "joao@x.com", name: null });
  });

  it("tira o histórico citado da resposta", () => {
    const t = "Pode ser amanhã às 10h.\n\nEm seg., 20 de out. de 2026 Fulano escreveu:\n> proposta";
    expect(stripQuoted(t)).toBe("Pode ser amanhã às 10h.");
  });

  it("bug 3: webhook do Resend só vale com assinatura svix correta e recente", () => {
    const secretRaw = Buffer.from("segredo-de-teste-123").toString("base64");
    const secret = `whsec_${secretRaw}`;
    const body = '{"type":"email.delivered"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(secretRaw, "base64"))
      .update(`msg_1.${ts}.${body}`)
      .digest("base64");
    const ok = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": ts,
      "svix-signature": `v1,${sig}`,
    });
    expect(verifySvix(secret, ok, body)).toBe(true);
    expect(verifySvix(secret, ok, body + " ")).toBe(false);
    const old = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(Number(ts) - 3600),
      "svix-signature": `v1,${sig}`,
    });
    expect(verifySvix(secret, old, body)).toBe(false);
    expect(verifySvix(secret, new Headers(), body)).toBe(false);
  });
});
