import { describe, expect, it } from "vitest";

import { groupSimilarTickets, keywords, similarity, type TicketLite } from "./incident-grouping";

const t = (n: number, subject: string, description: string | null = null): TicketLite => ({
  id: `t${n}`,
  number: n,
  subject,
  description,
  created_at: `2026-10-26T10:0${n}:00Z`,
});

describe("keywords", () => {
  it("tira acento, palavra vazia e plural simples", () => {
    expect(keywords({ subject: "Não consigo emitir os boletos", description: null })).toEqual([
      "emitir",
      "boleto",
    ]);
  });
});

describe("groupSimilarTickets", () => {
  const tickets = [
    t(1, "Boleto não gera", "erro ao emitir boleto"),
    t(2, "Erro ao emitir boleto"),
    t(3, "Não consigo emitir boletos hoje"),
    t(4, "Quero mudar meu plano"),
    t(5, "Mudar de plano"),
    t(6, "Boleto com erro na emissão", "emitir boleto deu erro"),
  ];

  it("junta os parecidos e ignora grupo pequeno", () => {
    const g = groupSimilarTickets(tickets);
    expect(g).toHaveLength(1);
    expect(g[0]!.tickets.map((x) => x.number)).toEqual([1, 2, 3, 6]);
    expect(g[0]!.words).toContain("boleto");
    expect(g[0]!.label).toBe("Boleto não gera");
  });

  it("minSize 2 também traz o grupo do plano", () => {
    const g = groupSimilarTickets(tickets, { minSize: 2 });
    expect(g.map((x) => x.tickets.length)).toEqual([4, 2]);
  });

  it("similaridade de listas vazias é zero", () => {
    expect(similarity([], ["a"])).toBe(0);
  });
});
