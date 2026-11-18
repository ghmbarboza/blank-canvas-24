import { describe, expect, it } from "vitest";

import { adLeadUtm, adLeadValues } from "./zernio-leads";

// Formato do lead.received da documentação da Zernio (lead.fields = pergunta → resposta).
describe("adLeadValues", () => {
  it("chaves padrão da Meta viram nome, e-mail e telefone", () => {
    expect(
      adLeadValues({
        fields: {
          full_name: "Jamie Rivera",
          email: "lead@example.com",
          phone_number: "+5511999990000",
        },
      }),
    ).toEqual({ nome: "Jamie Rivera", email: "lead@example.com", telefone: "+5511999990000" });
  });

  it("pergunta própria do formulário não se perde: vai para Outras respostas", () => {
    const v = adLeadValues({
      formName: "Orçamento implante",
      fields: {
        full_name: "Ana",
        qual_o_seu_orcamento: "k1",
        "Melhor horário": ["manhã", "tarde"],
      },
    });
    expect(v["nome"]).toBe("Ana");
    expect(v["respostas"]).toBe(
      "Formulário do anúncio: Orçamento implante\nqual o seu orcamento: k1\nMelhor horário: manhã, tarde",
    );
  });

  it("variações em português também casam", () => {
    expect(
      adLeadValues({
        fields: { "Nome completo": "Bia", WhatsApp: "11988887777", Cidade: "Campinas" },
      }),
    ).toEqual({
      nome: "Bia",
      telefone: "11988887777",
      cidade: "Campinas",
    });
  });

  it("resposta vazia é ignorada e lead sem campos não quebra", () => {
    expect(adLeadValues({ fields: { email: "", full_name: null } })).toEqual({});
    expect(adLeadValues({})).toEqual({});
  });
});

describe("adLeadUtm", () => {
  it("carrega campanha, anúncio e formulário de origem", () => {
    expect(adLeadUtm({ campaignId: "c1", adId: "a1", formId: "f1" })).toEqual({
      utm_source: "facebook",
      utm_medium: "paid",
      utm_campaign: "c1",
      utm_content: "a1",
      utm_term: "f1",
    });
  });
  it("lead orgânico ou de teste vem sem anúncio", () => {
    expect(adLeadUtm({ formId: "f1" })).toEqual({
      utm_source: "facebook",
      utm_medium: "paid",
      utm_term: "f1",
    });
  });
});
