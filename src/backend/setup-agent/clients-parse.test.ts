import { describe, expect, it } from "vitest";

import { parseClientLine, parseClientList } from "./clients-parse";
import { ruleKeyFrom } from "./runners/rules.server";

describe("lista de clientes colada na conversa", () => {
  it("lê nome e telefone em vários jeitos de escrever", () => {
    expect(parseClientLine("Maria Silva, 11 98888-7777")).toEqual({
      name: "Maria Silva",
      phone: "5511988887777",
      email: null,
    });
    expect(parseClientLine("João Souza (19) 97777-6666")?.phone).toBe("5519977776666");
    expect(parseClientLine("1. Ana Lima - +55 21 96666-5555 - ana@loja.com")).toEqual({
      name: "Ana Lima",
      phone: "5521966665555",
      email: "ana@loja.com",
    });
    expect(parseClientLine("11988887777")).toEqual({
      name: "Cliente",
      phone: "5511988887777",
      email: null,
    });
  });
  it("linha sem telefone válido fica de fora", () => {
    expect(parseClientLine("Carlos sem telefone")).toBeNull();
    expect(parseClientLine("Bia 1234")).toBeNull();
  });
  it("lista: tira telefone repetido, aponta as linhas ruins e respeita o limite", () => {
    const r = parseClientList(
      "Maria Silva, 11 98888-7777\nJoão Souza 19 97777-6666\nMaria de novo 11 98888-7777\nSem número\n",
    );
    expect(r.clients.map((c) => c.name)).toEqual(["Maria Silva", "João Souza"]);
    expect(r.bad).toEqual(["Sem número"]);
    const many = Array.from(
      { length: 300 },
      (_, i) => `Cliente ${i}, 11 9${String(10000000 + i)}`,
    ).join("\n");
    expect(parseClientList(many).clients).toHaveLength(200);
  });
});

describe("nome da regra dito pelo dono", () => {
  it("aceita a chave e o jeito comum de falar", () => {
    expect(ruleKeyFrom("recompra")).toBe("recompra");
    expect(ruleKeyFrom("Boas-vindas")).toBe("boas_vindas");
    expect(ruleKeyFrom("pesquisa de satisfação")).toBe("pesquisa");
    expect(ruleKeyFrom("cliente parado")).toBe("cliente_parado");
    expect(ruleKeyFrom("check-in")).toBe("checkin_7d");
    expect(ruleKeyFrom("desconto")).toBeNull();
  });
});
