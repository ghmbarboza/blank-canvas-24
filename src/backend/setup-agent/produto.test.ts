import { describe, expect, it } from "vitest";
import { parsePreco, parseProduto } from "./produto";
import { checkReply } from "@/backend/support/agent-logic";

describe("parsePreco", () => {
  it("lê preço em reais nos formatos que a pessoa escreve", () => {
    expect(parsePreco(250)).toBe(250);
    expect(parsePreco("250")).toBe(250);
    expect(parsePreco("R$ 1.234,56")).toBe(1234.56);
    expect(parsePreco("180,00")).toBe(180);
    expect(parsePreco("99.90")).toBe(99.9);
    expect(parsePreco("1.500")).toBe(1500);
  });
  it("recusa o que não é preço", () => {
    expect(parsePreco("grátis")).toBeNull();
    expect(parsePreco(-5)).toBeNull();
    expect(parsePreco("")).toBeNull();
    expect(parsePreco(undefined)).toBeNull();
  });
});

describe("parseProduto", () => {
  it("monta o serviço com cobrança avulsa por padrão", () => {
    expect(parseProduto({ nome: "Consulta de clínica geral", preco: "R$ 250" })).toEqual({
      name: "Consulta de clínica geral",
      price: 250,
      kind: "service",
      billing: "one_time",
      description: null,
    });
  });
  it("aceita produto e cobrança mensal", () => {
    const p = parseProduto({ nome: "Plano", preco: 99, tipo: "produto", cobranca: "mensal" });
    expect(p.kind).toBe("product");
    expect(p.billing).toBe("monthly");
  });
  it("barra nome vazio e preço inválido", () => {
    expect(() => parseProduto({ nome: " ", preco: 10 })).toThrow(/nome/);
    expect(() => parseProduto({ nome: "Consulta", preco: "sob consulta" })).toThrow(/preço/);
  });
  it("o preço cadastrado passa na trava do agente", () => {
    const p = parseProduto({ nome: "Consulta", preco: "250" });
    expect(checkReply("A consulta custa R$ 250.", [p.price]).ok).toBe(true);
    expect(checkReply("A consulta custa R$ 250.", []).ok).toBe(false);
  });
});
