import { describe, expect, it } from "vitest";

import { googleLeadUtm, mapGoogleLeadToForm, parseGoogleLead } from "./google-leads";

// Exemplo no formato da documentação do Google Ads (webhook de formulário de lead).
const SAMPLE = {
  lead_id:
    "TeSter-123-ABCDEFGHIJKLMNOPQRSTUVWXYZ-abcdefghijklmnopqrstuvwxyz-0123456789-AaBbCcDdEeFfGgHhIiJjKkLl",
  user_column_data: [
    { column_name: "Full Name", string_value: "Maria Souza", column_id: "FULL_NAME" },
    { column_name: "User Phone", string_value: "+5548999990000", column_id: "PHONE_NUMBER" },
    { column_name: "User Email", string_value: "maria@exemplo.com", column_id: "EMAIL" },
    { column_name: "Company Name", string_value: "Acme", column_id: "COMPANY_NAME" },
    { column_name: "Qual o seu orçamento?", string_value: "R$ 10 mil" },
  ],
  api_version: "1.0",
  form_id: 40000000000,
  campaign_id: 12345678901,
  google_key: "chave-secreta",
  is_test: true,
  gcl_id: "TeSter-123",
  adgroup_id: 20000000000,
  creative_id: 30000000000,
};

const FIELDS = [
  { key: "nome", map: "name" },
  { key: "email", map: "email" },
  { key: "whats", map: "phone" },
  { key: "empresa", map: "company" },
  { key: "qual_o_seu_orcamento", map: null },
];

describe("parseGoogleLead", () => {
  it("lê o corpo oficial", () => {
    const p = parseGoogleLead(SAMPLE)!;
    expect(p.googleKey).toBe("chave-secreta");
    expect(p.isTest).toBe(true);
    expect(p.campaignId).toBe("12345678901");
    expect(p.gclid).toBe("TeSter-123");
    expect(p.columns).toMatchObject({
      full_name: "Maria Souza",
      email: "maria@exemplo.com",
      phone_number: "+5548999990000",
      qual_o_seu_orcamento: "R$ 10 mil",
    });
  });

  it("recusa corpo sem lead_id ou sem google_key", () => {
    expect(parseGoogleLead({ ...SAMPLE, lead_id: "" })).toBeNull();
    expect(parseGoogleLead({ ...SAMPLE, google_key: undefined })).toBeNull();
    expect(parseGoogleLead("texto")).toBeNull();
    expect(parseGoogleLead(null)).toBeNull();
  });

  it("ignora coluna vazia e não deixa a segunda sobrescrever a primeira", () => {
    const p = parseGoogleLead({
      ...SAMPLE,
      user_column_data: [
        { column_id: "EMAIL", string_value: "a@b.com" },
        { column_id: "EMAIL", string_value: "c@d.com" },
        { column_id: "CITY", string_value: "   " },
      ],
    })!;
    expect(p.columns).toEqual({ email: "a@b.com" });
  });
});

describe("mapGoogleLeadToForm", () => {
  it("leva as colunas padrão para os campos do contato e as perguntas por chave igual", () => {
    const p = parseGoogleLead(SAMPLE)!;
    expect(mapGoogleLeadToForm(p.columns, FIELDS)).toEqual({
      nome: "Maria Souza",
      email: "maria@exemplo.com",
      whats: "+5548999990000",
      empresa: "Acme",
      qual_o_seu_orcamento: "R$ 10 mil",
    });
  });

  it("junta nome e sobrenome quando o formulário pede separado", () => {
    expect(
      mapGoogleLeadToForm({ first_name: "Ana", last_name: "Lima" }, [{ key: "n", map: "name" }]),
    ).toEqual({ n: "Ana Lima" });
  });

  it("e-mail de trabalho cai no e-mail quando não há outro", () => {
    expect(mapGoogleLeadToForm({ work_email: "a@b.com" }, FIELDS)).toEqual({ email: "a@b.com" });
  });
});

describe("googleLeadUtm", () => {
  it("marca origem Google pago com campanha, anúncio e gclid", () => {
    expect(googleLeadUtm(parseGoogleLead(SAMPLE)!)).toEqual({
      utm_source: "google",
      utm_medium: "paid",
      utm_campaign: "12345678901",
      utm_content: "30000000000",
      gclid: "TeSter-123",
    });
  });
});
