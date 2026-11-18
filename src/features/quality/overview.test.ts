import { describe, expect, it } from "vitest";

import {
  agreementLabel,
  bucketsSentence,
  evidenceByCriterion,
  previousAverage,
  scoreBuckets,
} from "./overview";
import type { EvaluationItem } from "./scoring";

function item(p: Partial<EvaluationItem> & { criterion_id: string }): EvaluationItem {
  return {
    label: p.criterion_id,
    weight: 1,
    eliminatory: false,
    score: 40,
    passed: false,
    evidence: "",
    evidence_verified: false,
    comment: "",
    ...p,
  };
}

describe("scoreBuckets", () => {
  it("distribui as notas nas quatro faixas com porcentagem", () => {
    const b = scoreBuckets([
      { score: 95, eliminated: false },
      { score: 90, eliminated: false },
      { score: 72, eliminated: false },
      { score: 51, eliminated: false },
    ]);
    expect(b.map((x) => x.count)).toEqual([2, 1, 1, 0]);
    expect(b[0]!.pct).toBe(50);
  });

  it("conta eliminada como abaixo de 50 e ignora nota vazia", () => {
    const b = scoreBuckets([
      { score: 98, eliminated: true },
      { score: null, eliminated: false },
    ]);
    expect(b.find((x) => x.key === "low")!.count).toBe(1);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(1);
  });

  it("devolve zero sem dividir por zero quando não há nota", () => {
    expect(scoreBuckets([]).every((x) => x.pct === 0)).toBe(true);
  });
});

describe("bucketsSentence", () => {
  it("cita a faixa dominante e quantas ficaram abaixo de 50", () => {
    const s = bucketsSentence(
      scoreBuckets([
        { score: 95, eliminated: false },
        { score: 92, eliminated: false },
        { score: 30, eliminated: false },
      ]),
    );
    expect(s).toContain("90 a 100 (67%)");
    expect(s).toContain("1 interação ficou abaixo de 50");
  });

  it("avisa quando não há nota", () => {
    expect(bucketsSentence(scoreBuckets([]))).toBe("Sem notas no período.");
  });
});

describe("previousAverage", () => {
  it("recupera a média do período anterior a partir do dobro do período", () => {
    // atual: 10 notas com média 80; dobro: 20 notas com média 75 -> anterior = 70
    expect(
      previousAverage({ evaluated: 10, avg_score: 80 }, { evaluated: 20, avg_score: 75 }),
    ).toBeCloseTo(70);
  });

  it("sem nota no período anterior não há base", () => {
    expect(
      previousAverage({ evaluated: 10, avg_score: 80 }, { evaluated: 10, avg_score: 80 }),
    ).toBeNull();
    expect(
      previousAverage({ evaluated: 0, avg_score: null }, { evaluated: 4, avg_score: 60 }),
    ).toBeNull();
  });
});

describe("evidenceByCriterion", () => {
  const evals = [
    {
      id: "e1",
      channel: "chat",
      created_at: "2026-10-26T10:00:00Z",
      items: [item({ criterion_id: "sondagem", evidence: "trecho solto" })],
    },
    {
      id: "e2",
      channel: "call",
      created_at: "2026-10-25T10:00:00Z",
      items: [
        item({ criterion_id: "sondagem", evidence: "trecho conferido", evidence_verified: true }),
        item({ criterion_id: "tom", evidence: "aprovado", passed: true }),
      ],
    },
  ];

  it("prefere o trecho conferido na transcrição", () => {
    const m = evidenceByCriterion(evals, ["sondagem"]);
    expect(m.get("sondagem")).toMatchObject({ evaluationId: "e2", quote: "trecho conferido" });
  });

  it("ignora critério aprovado e critério sem trecho", () => {
    const m = evidenceByCriterion(evals, ["tom", "inexistente"]);
    expect(m.size).toBe(0);
  });
});

describe("agreementLabel", () => {
  it("traduz a concordância em palavras", () => {
    expect(agreementLabel(null)).toBeNull();
    expect(agreementLabel(92)).toBe("Alinhada");
    expect(agreementLabel(75)).toBe("Pede atenção");
    expect(agreementLabel(40)).toBe("Desalinhada");
  });
});
