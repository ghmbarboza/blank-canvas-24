import { describe, expect, it } from "vitest";

import { AWAY_DEFAULT_TEXT, awayDecision } from "./away-logic";

// segunda-feira 2026-11-02 às 22:00 em São Paulo = 01:00 UTC de terça
const NIGHT = new Date("2026-11-03T01:00:00Z");
const NOON = new Date("2026-11-02T15:00:00Z");
const bh = { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };
const base = {
  tz: "America/Sao_Paulo",
  businessHours: bh,
  away: { enabled: true, text: "Voltamos às 9h." },
  answered: false,
  lastAwayAt: null,
};

describe("awayDecision", () => {
  it("fora do horário, ligada e sem resposta: manda o texto da empresa", () => {
    expect(awayDecision({ ...base, now: NIGHT })).toEqual({ send: true, text: "Voltamos às 9h." });
  });
  it("dentro do horário não manda", () => {
    expect(awayDecision({ ...base, now: NOON }).send).toBe(false);
  });
  it("desligada não manda", () => {
    expect(awayDecision({ ...base, now: NIGHT, away: { enabled: false } }).send).toBe(false);
  });
  it("se a IA ou alguém já respondeu, não manda (sem resposta dupla)", () => {
    expect(awayDecision({ ...base, now: NIGHT, answered: true }).send).toBe(false);
  });
  it("uma vez a cada 12 h por conversa", () => {
    const lastAwayAt = new Date(NIGHT.getTime() - 3 * 3600_000);
    expect(awayDecision({ ...base, now: NIGHT, lastAwayAt }).send).toBe(false);
    const old = new Date(NIGHT.getTime() - 13 * 3600_000);
    expect(awayDecision({ ...base, now: NIGHT, lastAwayAt: old }).send).toBe(true);
  });
  it("texto vazio usa o padrão; atendimento 24 h nunca manda", () => {
    expect(awayDecision({ ...base, now: NIGHT, away: { enabled: true, text: " " } })).toEqual({
      send: true,
      text: AWAY_DEFAULT_TEXT,
    });
    expect(awayDecision({ ...base, now: NIGHT, businessHours: { always: true } }).send).toBe(false);
  });
});
