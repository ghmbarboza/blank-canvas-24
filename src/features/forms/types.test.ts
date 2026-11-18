import { describe, expect, it } from "vitest";

import {
  cleanUtm,
  isTooFast,
  mapToContact,
  touchFrom,
  validateSubmission,
  type FormField,
} from "./types";

const fields: FormField[] = [
  { key: "nome", label: "Nome", type: "text", required: true, map: "name" },
  { key: "email", label: "E-mail", type: "email", required: true, map: "email" },
  { key: "zap", label: "WhatsApp", type: "phone", required: false, map: "phone" },
  { key: "unidades", label: "Unidades", type: "number", required: false, map: "custom.unidades" },
  {
    key: "plano",
    label: "Plano",
    type: "select",
    required: false,
    map: null,
    options: ["Básico", "Pro"],
  },
];

describe("formulário", () => {
  it("valida obrigatório, e-mail, telefone e opção", () => {
    expect(
      validateSubmission(fields, { nome: "", email: "x", zap: "1234", plano: "Ouro" }),
    ).toEqual({
      nome: "Obrigatório",
      email: "E-mail inválido",
      zap: "Telefone com DDD",
      plano: "Opção inválida",
    });
    expect(validateSubmission(fields, { nome: "Ana", email: "ana@x.com.br" })).toEqual({});
  });
  it("mapeia para colunas do contato e campos personalizados", () => {
    const r = mapToContact(fields, {
      nome: " Ana ",
      email: "ANA@X.COM",
      zap: "(11) 99999-0000",
      unidades: "3,5",
    });
    expect(r.contact).toEqual({ name: "Ana", email: "ana@x.com", phone: "5511999990000" });
    expect(r.custom).toEqual({ unidades: 3.5 });
  });
  it("UTM limpa e atribuição por clique de anúncio ou referrer", () => {
    expect(cleanUtm({ utm_source: "ig", hacker: "x" })).toEqual({ utm_source: "ig" });
    expect(touchFrom({ gclid: "abc" }, null, "form", "t").source).toBe("google");
    const t = touchFrom({}, "https://www.google.com/search?q=x", "form", "t");
    expect([t.source, t.medium]).toEqual(["google.com", "organic"]);
    expect(touchFrom({}, null, "form", "t").source).toBe("direto");
  });
});

describe("envio rápido (A1)", () => {
  it("é só um sinal: rápido marca, devagar ou sem horário não marca", () => {
    expect(isTooFast(1000, 2000)).toBe(true);
    expect(isTooFast(1000, 4000)).toBe(false);
    expect(isTooFast(undefined, 4000)).toBe(false);
    expect(isTooFast("1000", 1500)).toBe(false);
  });
});
