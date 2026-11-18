import { describe, expect, it } from "vitest";

import { planImport, phoneVariants } from "./dedupe";
import { buildRecords, type TargetField } from "./mapping";

const MAP: TargetField[] = [
  "contact.name",
  "contact.email",
  "contact.phone",
  "company.name",
  "company.cnpj",
  "deal.title",
];

describe("deduplicação", () => {
  it("junta a mesma pessoa repetida na planilha (por e-mail ou por telefone)", () => {
    const recs = buildRecords(
      [
        ["Ana", "ana@x.com", "", "ACME", "", ""],
        ["Ana Souza", "", "48999991111", "", "", ""],
        ["", "ana@x.com", "48999991111", "", "", "Renovação"],
        ["Bruno", "bruno@x.com", "", "ACME", "", ""],
      ],
      MAP,
    );
    const plan = planImport(recs, { contacts: [], companies: [] });
    // linha 2 e 4 casam por e-mail; linha 3 é telefone novo (sem e-mail) — vira outro contato até a linha 4 ligar os dois
    expect(plan.totals.contactsNew).toBeLessThanOrEqual(3);
    expect(plan.totals.mergedInFile).toBeGreaterThanOrEqual(1);
    expect(plan.totals.companiesNew).toBe(1); // ACME uma vez só
    expect(plan.deals).toHaveLength(1);
    const ana = plan.contacts.find((c) => c.email === "ana@x.com");
    expect(ana?.phone).toBe("5548999991111");
    expect(ana?.lines).toContain(4);
  });

  it("reconhece quem já está na conta e diz o que vai preencher", () => {
    const recs = buildRecords(
      [["Carla", "carla@x.com", "48 98888-7777", "Beta", "11.222.333/0001-81", ""]],
      MAP,
    );
    const plan = planImport(recs, {
      contacts: [
        {
          id: "c1",
          name: "Carla",
          email: null,
          phone: "+5548988887777",
          job_title: null,
          city: null,
          company_id: null,
        },
      ],
      companies: [{ id: "co1", name: "Beta Ltda", cnpj: "11222333000181" }],
    });
    expect(plan.totals).toMatchObject({
      contactsNew: 0,
      contactsUpdated: 1,
      companiesNew: 0,
      companiesExisting: 1,
    });
    expect(plan.contacts[0]?.existingId).toBe("c1");
    expect(plan.contacts[0]?.fills).toEqual(["e-mail", "empresa"]);
    expect(plan.companies[0]?.existingId).toBe("co1");
  });

  it("empresa existente casa pelo nome quando não há CNPJ", () => {
    const recs = buildRecords([["Davi", "davi@x.com", "", "acme", "", ""]], MAP);
    const plan = planImport(recs, {
      contacts: [],
      companies: [{ id: "co9", name: "ACME", cnpj: null }],
    });
    expect(plan.companies[0]?.existingId).toBe("co9");
  });

  it("linha vazia fica de fora com o motivo", () => {
    const plan = planImport(buildRecords([["", "", "", "", "", ""]], MAP), {
      contacts: [],
      companies: [],
    });
    expect(plan.skipped).toHaveLength(1);
    expect(plan.totals.skipped).toBe(1);
  });

  it("variações do telefone para achar o que já está gravado", () => {
    expect(phoneVariants("5548999991111")).toEqual(
      expect.arrayContaining(["5548999991111", "+5548999991111", "48999991111"]),
    );
  });
});
