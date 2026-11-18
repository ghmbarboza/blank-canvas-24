import { describe, expect, it } from "vitest";

import {
  buildRecords,
  detectSource,
  normalizeCnpj,
  normalizePhone,
  parseDate,
  parseDealStatus,
  parseMoney,
  suggestMapping,
} from "./mapping";

describe("reconhecer a origem", () => {
  it("Pipedrive, HubSpot, Kommo e RD pelos cabeçalhos típicos", () => {
    expect(
      detectSource([
        "Deal - Title",
        "Person - Name",
        "Organization - Name",
        "Deal - Value",
        "Person - Email",
      ]),
    ).toBe("pipedrive");
    expect(
      detectSource([
        "Record ID",
        "First Name",
        "Last Name",
        "Email",
        "Lifecycle Stage",
        "Contact owner",
      ]),
    ).toBe("hubspot");
    expect(
      detectSource([
        "ID",
        "Nome do lead",
        "Status do lead",
        "Funil",
        "Telefone comercial",
        "E-mail comercial",
      ]),
    ).toBe("kommo");
    expect(
      detectSource([
        "Nome",
        "Empresa",
        "Funil de vendas",
        "Etapa",
        "Valor Único",
        "Responsável",
        "Fonte",
      ]),
    ).toBe("rdstation");
    expect(detectSource(["nome", "telefone", "email"])).toBe("planilha");
  });
});

describe("sugestão de colunas", () => {
  it("planilha comum em português", () => {
    expect(suggestMapping(["Nome", "Celular", "E-mail", "Empresa", "CNPJ", "Cargo"], [])).toEqual([
      "contact.name",
      "contact.phone",
      "contact.email",
      "company.name",
      "company.cnpj",
      "contact.job_title",
    ]);
  });

  it("RD Station: 'Nome' é a negociação e o contato vem em 'Contatos'", () => {
    const m = suggestMapping(
      ["Nome", "Contatos", "Email", "Etapa", "Estado", "Valor Único"],
      [],
      [],
      "rdstation",
    );
    expect(m).toEqual([
      "deal.title",
      "contact.name",
      "contact.email",
      "deal.stage",
      "deal.status",
      "deal.value",
    ]);
  });

  it("Kommo: 'Nome do lead' é o negócio", () => {
    const m = suggestMapping(
      ["Nome do lead", "Contato principal", "Orçamento", "Status do lead"],
      [],
      [],
      "kommo",
    );
    expect(m).toEqual(["deal.title", "contact.name", "deal.value", "deal.stage"]);
  });

  it("pelo conteúdo quando o cabeçalho não diz nada", () => {
    const sample = [
      ["joao@a.com", "(48) 99999-1111", "12.345.678/0001-95"],
      ["maria@b.com", "48988887777", "11222333000181"],
    ];
    expect(suggestMapping(["col1", "col2", "col3"], sample)).toEqual([
      "contact.email",
      "contact.phone",
      "company.cnpj",
    ]);
  });

  it("campo personalizado da conta pelo rótulo, e cada destino só uma vez", () => {
    const m = suggestMapping(
      ["Plano", "Email", "Email"],
      [],
      [{ entity: "contact", key: "plano", label: "Plano" }],
    );
    expect(m).toEqual(["custom.contact.plano", "contact.email", "ignore"]);
  });
});

describe("normalização", () => {
  it("telefone brasileiro ganha 55; lixo vira null", () => {
    expect(normalizePhone("(48) 99999-1111")).toBe("5548999991111");
    expect(normalizePhone("+55 48 99999-1111")).toBe("5548999991111");
    expect(normalizePhone("0048 999991111")).toBe("5548999991111");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("48 99999-1111 / 48 3333-2222")).toBe("5548999991111");
  });
  it("CNPJ, dinheiro, data e situação", () => {
    expect(normalizeCnpj("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizeCnpj("123")).toBeNull();
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney("1,234.5")).toBe(1234.5);
    expect(parseMoney("abc")).toBeNull();
    expect(parseDate("31/12/2026")).toBe("2026-12-31");
    expect(parseDate("2026-01-05T10:00")).toBe("2026-01-05");
    expect(parseDealStatus("Vendida")).toBe("won");
    expect(parseDealStatus("Perdida")).toBe("lost");
    expect(parseDealStatus("Em andamento")).toBe("open");
    expect(parseDealStatus("?")).toBeNull();
  });
});

describe("registros", () => {
  it("junta primeiro nome e sobrenome e registra os problemas da linha", () => {
    const [r] = buildRecords(
      [["Ana", "Souza", "nao-e-email", "48 99999-1111", "ACME", "Proposta", "R$ 10,00"]],
      [
        "contact.first_name",
        "contact.last_name",
        "contact.email",
        "contact.phone",
        "company.name",
        "deal.title",
        "deal.value",
      ],
    );
    expect(r?.contact.name).toBe("Ana Souza");
    expect(r?.contact.email).toBeNull();
    expect(r?.problems).toContain("E-mail inválido, ficou de fora");
    expect(r?.company?.name).toBe("ACME");
    expect(r?.deal).toMatchObject({ title: "Proposta", value: 10 });
    expect(r?.line).toBe(2);
  });

  it("linha vazia é marcada", () => {
    const [r] = buildRecords([["", ""]], ["contact.name", "contact.email"]);
    expect(r?.problems[0]).toContain("Linha sem nome");
  });
});
