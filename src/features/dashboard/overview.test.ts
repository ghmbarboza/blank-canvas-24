import { describe, expect, it } from "vitest";

import type { RuleRow } from "@/features/posvenda/api";

import { heroSummary, rulesSummary, satisfaction } from "./overview";

const base = { nps: null, nps_responses: 0, csat_avg: null, csat_responses: 0, csat_sent: 0 };

describe("satisfação no painel", () => {
  it("sem pesquisa respondida não inventa nota e aponta o próximo passo", () => {
    expect(satisfaction(base)).toEqual({
      kind: "none",
      value: "—",
      foot: "Ligue a Pesquisa de satisfação nas Regras de pós-venda",
    });
    expect(satisfaction({ ...base, csat_sent: 4 }).foot).toBe(
      "Pesquisa enviada, ainda sem resposta",
    );
  });

  it("destaca o NPS quando há resposta e cita a nota média junto", () => {
    const s = satisfaction({
      ...base,
      nps: 62,
      nps_responses: 13,
      csat_avg: 4.6,
      csat_responses: 8,
    });
    expect(s.kind).toBe("nps");
    expect(s.value).toBe("62");
    expect(s.foot).toBe("NPS de 13 respostas · Nota média 4,6 de 5");
  });

  it("sem NPS usa a nota média", () => {
    const s = satisfaction({ ...base, csat_avg: 4.25, csat_responses: 1 });
    expect(s).toEqual({ kind: "csat", value: "4,3/5", foot: "Nota média de 1 resposta" });
  });
});

describe("regras de pós-venda no painel", () => {
  it("conta as ligadas e quantos clientes passaram por elas", () => {
    const row = (status: string, total: number) =>
      ({ status, stats: { total, active: 0, done: 0, exited: 0, converted: 0 } }) as RuleRow;
    const s = rulesSummary({ boas_vindas: row("active", 12), pesquisa: row("paused", 3) });
    expect(s.on).toBe(1);
    expect(s.total).toBe(9);
    expect(s.reached).toBe(15);
    expect(s.lines.find((l) => l.key === "pesquisa")).toMatchObject({ on: false, reached: 3 });
    expect(s.lines.find((l) => l.key === "recompra")).toMatchObject({ on: false, reached: 0 });
  });
});

describe("frase do topo", () => {
  it("conta vazia recebe o próximo passo, sem número", () => {
    expect(heroSummary({ conversations: 0, clients: 0, risk: 0, waiting: 0 })).toMatch(
      /^Ainda sem movimento/,
    );
  });

  it("fala de clientes, risco e quem espera", () => {
    expect(heroSummary({ conversations: 40, clients: 18, risk: 2, waiting: 1 })).toBe(
      "Você cuida de 18 clientes e 2 estão em risco; a equipe atendeu 40 conversas no período. 1 cliente espera resposta agora.",
    );
    expect(heroSummary({ conversations: 3, clients: null, risk: 0, waiting: 0 })).toBe(
      "A equipe atendeu 3 conversas no período. Ninguém esperando resposta agora.",
    );
  });
});
