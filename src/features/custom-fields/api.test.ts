import { describe, expect, it } from "vitest";

import { missingRequired, slugKey, type CustomField } from "./api";

const base = {
  id: "1",
  account_id: "a",
  entity: "deal",
  label: "x",
  type: "text",
  options: [],
  required: false,
  required_stage_id: null,
  help: null,
  position: 0,
  archived: false,
  created_at: "",
} as unknown as CustomField;

describe("campos personalizados", () => {
  it("gera chave estável sem acento nem espaço", () => {
    expect(slugKey("Telefone comercial")).toBe("telefone_comercial");
    expect(slugKey("Nº de funcionários")).toBe("n_de_funcionarios");
    expect(slugKey("2º contato")).toBe("campo_2_contato");
  });
  it("cobra o obrigatório sempre e o da etapa só naquela etapa", () => {
    const always = { ...base, key: "cnpj", required: true };
    const atStage = { ...base, key: "contrato", required_stage_id: "s2" };
    expect(missingRequired([always, atStage], {}, "s1").map((f) => f.key)).toEqual(["cnpj"]);
    expect(missingRequired([always, atStage], { cnpj: "1" }, "s2").map((f) => f.key)).toEqual([
      "contrato",
    ]);
    expect(missingRequired([always, atStage], { cnpj: "1", contrato: "ok" }, "s2")).toEqual([]);
  });
});
