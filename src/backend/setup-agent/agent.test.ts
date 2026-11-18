import { describe, expect, it } from "vitest";

import { summaryOf } from "./agent.server";
import { REPLY, SETUP_TOOLS } from "./spec";
import { normalizeFields } from "./tools.server";

const resend = [
  { key: "api_key", secret: true },
  { key: "from_email" },
  { key: "from_name" },
  { key: "webhook_secret", secret: true },
];

describe("normalizeFields", () => {
  it("leva 'chave', 'key' ou 'apiKey' para o campo secreto principal", () => {
    for (const k of ["chave", "key", "apiKey", "API_KEY", "token"])
      expect(normalizeFields(resend, { [k]: "re_x" }), k).toEqual({ api_key: "re_x" });
  });
  it("mantém os campos com o nome certo e ignora vazio", () => {
    expect(
      normalizeFields(resend, { from_email: "a@b.com", fromName: "Sorriso", api_key: " ", x: "1" }),
    ).toEqual({
      from_email: "a@b.com",
      from_name: "Sorriso",
    });
  });
});

describe("summaryOf", () => {
  it("resume o que deu certo e o que falhou quando a IA não escreve", () => {
    expect(
      summaryOf([
        { kind: "done", label: "Empresa salva", tool: "salvar_empresa" },
        { kind: "error", label: "Falta a chave da Zernio", tool: "link_whatsapp" },
      ]),
    ).toBe(
      "Feito: Empresa salva. Não consegui: Falta a chave da Zernio. O que mais você quer configurar?",
    );
  });
});

describe("ferramentas", () => {
  it("responder está na lista (o modelo é obrigado a usar ferramenta para falar)", () => {
    expect(SETUP_TOOLS.map((t) => t.name)).toContain(REPLY.name);
    expect(new Set(SETUP_TOOLS.map((t) => t.name)).size).toBe(SETUP_TOOLS.length);
  });
});

import { fieldsArg } from "./tools.server";

describe("fieldsArg", () => {
  it("aceita campos como objeto, texto JSON, texto puro ou soltos no nível de cima", () => {
    expect(fieldsArg({ provedor: "resend", campos: { api_key: "re_1" } })).toEqual({
      api_key: "re_1",
    });
    expect(fieldsArg({ provedor: "resend", campos: '{"api_key":"re_2"}' })).toEqual({
      api_key: "re_2",
    });
    expect(fieldsArg({ provedor: "resend", campos: "re_3" })).toEqual({ api_key: "re_3" });
    expect(fieldsArg({ provedor: "resend", api_key: "re_4" })).toEqual({ api_key: "re_4" });
  });
});
