import { describe, expect, it } from "vitest";

import { rankMacros, renderMacro, type MacroLite } from "./macros";

describe("renderMacro", () => {
  const vars = {
    contactName: "Maria Souza",
    agentName: "Ana Lima",
    companyName: "Loja X",
    ticketNumber: 42,
    today: new Date("2026-10-26T12:00:00Z"),
  };

  it("troca as variáveis novas e a antiga {nome}", () => {
    const r = renderMacro(
      "Oi {nome}, aqui é {{atendente.nome}} da {{empresa.nome}}. Seu chamado {{chamado.numero}} está em análise.",
      vars,
    );
    expect(r.text).toBe("Oi Maria, aqui é Ana da Loja X. Seu chamado #42 está em análise.");
    expect(r.missing).toEqual([]);
  });

  it("variável sem valor some sem deixar chave e aparece em missing", () => {
    const r = renderMacro("Oi {{contato.primeiro_nome}}, seu pedido {{pedido}} saiu.", {});
    expect(r.text).toBe("Oi, seu pedido saiu.");
    expect(r.missing).toEqual(["contato.primeiro_nome", "pedido"]);
  });

  it("aceita espaço dentro das chaves e caixa diferente", () => {
    expect(renderMacro("{{ Contato.Nome }}", vars).text).toBe("Maria Souza");
  });
});

describe("rankMacros", () => {
  const m = (id: string, title: string, intents: string[], use = 0): MacroLite => ({
    id,
    shortcut: id,
    title,
    body: title,
    intents,
    use_count: use,
  });
  const list = [
    m("oi", "Saudação inicial", ["saudação"], 50),
    m("troca", "Como fazer a troca do produto", ["troca ou devolução"]),
    m("rastreio", "Rastreio do pedido enviado", ["status do pedido"]),
  ];

  it("intenção igual vem primeiro", () => {
    expect(rankMacros(list, "status do pedido", "")[0]!.id).toBe("rastreio");
  });

  it("sem intenção, usa as palavras da mensagem do cliente", () => {
    expect(rankMacros(list, null, "quero fazer a troca do produto")[0]!.id).toBe("troca");
  });

  it("sem pista nenhuma, a mais usada", () => {
    expect(rankMacros(list, null, "")[0]!.id).toBe("oi");
  });
});
