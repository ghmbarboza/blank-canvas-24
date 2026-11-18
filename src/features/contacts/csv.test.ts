import { describe, expect, it } from "vitest";

import { CSV_HEADERS, buildImport, contactsToCsv } from "./csv";
import type { ContactRow } from "./types";

describe("importação de planilha com data da compra", () => {
  it("linha com data da compra entra como cliente, de importação, com a data guardada", () => {
    const r = buildImport(
      "nome;telefone;Data da Compra\nAna;11 98888-7777;05/11/2026\nBia;11 97777-6666;\n",
    );
    expect(r.invalid).toEqual([]);
    expect(r.valid[0]).toMatchObject({
      name: "Ana",
      lifecycle: "customer",
      // origem "import...": quem comprou antes não recebe boas-vindas atrasada
      source: "import_csv",
      custom: { ultima_compra: "2026-11-05" },
    });
    // sem data continua contato comum, como antes
    expect(r.valid[1]).toMatchObject({ name: "Bia", source: "csv" });
    expect(r.valid[1]).not.toHaveProperty("lifecycle");
    expect(r.valid[1]).not.toHaveProperty("custom");
  });

  it("aceita a coluna data_compra em formato ISO e recusa data inválida ou no futuro", () => {
    const r = buildImport(
      "nome,telefone,data_compra\nAna,11988887777,2026-11-05\nBia,11977776666,31/02/2026\nCris,11966665555,01/01/2099\n",
    );
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]).toMatchObject({ custom: { ultima_compra: "2026-11-05" } });
    expect(r.invalid).toEqual([
      { line: 3, message: "Data da compra inválida (use dia/mês/ano, ex.: 05/11/2026)" },
      { line: 4, message: "Data da compra no futuro" },
    ]);
  });

  it("planilha antiga, sem a coluna, importa igual", () => {
    const r = buildImport("nome,telefone,email\nAna,11988887777,ana@x.com\n");
    expect(r.valid).toEqual([
      {
        source: "csv",
        name: "Ana",
        phone: "5511988887777",
        email: "ana@x.com",
        company: null,
        job_title: null,
        city: null,
        tags: [],
      },
    ]);
  });

  it("a exportação leva a data da compra na coluna do modelo", () => {
    expect(CSV_HEADERS).toContain("data_compra");
    const row = {
      name: "Ana",
      phone: null,
      email: null,
      company: null,
      job_title: null,
      city: null,
      tags: [],
      temperature: null,
      score: null,
      lifecycle: "customer",
      source: null,
      ai_intent: null,
      ai_next_step: null,
      custom: { ultima_compra: "2026-11-05" },
    } as unknown as ContactRow;
    const [header, line] = contactsToCsv([row]).split("\r\n");
    const cols = header!.split(",");
    expect(line!.split(",")[cols.indexOf("data_compra")]).toBe("2026-11-05");
  });
});
