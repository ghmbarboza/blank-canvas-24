import { describe, expect, it } from "vitest";

import {
  averageWait,
  backlogAgents,
  erlangC,
  requiredAgents,
  serviceLevelFor,
  trafficIntensity,
} from "./erlang";

describe("Erlang C", () => {
  it("bate a tabela clássica para 10 erlangs", () => {
    // Valores de referência da tabela de Erlang C (A = 10).
    expect(erlangC(11, 10)).toBeCloseTo(0.6821, 3);
    expect(erlangC(12, 10)).toBeCloseTo(0.4494, 3);
    expect(erlangC(13, 10)).toBeCloseTo(0.2853, 3);
    expect(erlangC(14, 10)).toBeCloseTo(0.1741, 3);
  });

  it("devolve 1 quando há menos atendentes que tráfego (fila infinita)", () => {
    expect(erlangC(10, 10)).toBe(1);
    expect(serviceLevelFor(9, 10, 180, 20)).toBe(0);
    expect(averageWait(10, 10, 180)).toBe(Number.POSITIVE_INFINITY);
  });

  it("caso conhecido: 100 ligações em 30 min, TMA 3 min, meta 80% em 20 s = 14 atendentes", () => {
    const r = requiredAgents({
      arrivals: 100,
      ahtSeconds: 180,
      intervalSeconds: 1800,
      serviceLevel: 0.8,
      answerSeconds: 20,
    });
    expect(r.trafficErlangs).toBe(10);
    expect(r.agents).toBe(14);
    expect(r.serviceLevel).toBeCloseTo(0.886, 2);
    expect(r.averageWaitSeconds).toBeCloseTo(7.8, 0);
    expect(r.occupancy).toBeCloseTo(10 / 14, 3);
  });

  it("13 atendentes não chegam a 80% nesse cenário", () => {
    expect(serviceLevelFor(13, 10, 180, 20)).toBeLessThan(0.8);
  });

  it("aplica a perda (pausa e ausência) só na escala", () => {
    const r = requiredAgents({
      arrivals: 100,
      ahtSeconds: 180,
      intervalSeconds: 1800,
      serviceLevel: 0.8,
      answerSeconds: 20,
      shrinkage: 0.3,
    });
    expect(r.agents).toBe(14);
    expect(r.scheduled).toBe(20); // 14 / 0,7
  });

  it("chat com 3 conversas por pessoa precisa de menos gente", () => {
    const voz = requiredAgents({
      arrivals: 60,
      ahtSeconds: 420,
      serviceLevel: 0.8,
      answerSeconds: 60,
    });
    const chat = requiredAgents({
      arrivals: 60,
      ahtSeconds: 420,
      serviceLevel: 0.8,
      answerSeconds: 60,
      concurrency: 3,
    });
    expect(chat.agents).toBeLessThan(voz.agents);
  });

  it("sem volume, zero pessoas", () => {
    expect(
      requiredAgents({ arrivals: 0, ahtSeconds: 200, serviceLevel: 0.8, answerSeconds: 20 }).agents,
    ).toBe(0);
    expect(trafficIntensity(10, 0)).toBe(0);
  });

  it("carga de chamado: horas de trabalho divididas pela ocupação", () => {
    // 10 chamados de 15 min na hora = 2,5 h de trabalho; ÷ 0,85 = 2,94 → 3 pessoas
    expect(backlogAgents(10, 900).agents).toBe(3);
    expect(backlogAgents(0, 900).agents).toBe(0);
  });
});
