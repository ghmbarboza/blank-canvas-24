import { describe, expect, it } from "vitest";

import {
  bestHour,
  canTrain,
  featureLabel,
  featurize,
  predict,
  train,
  type LeadFeatureRow,
} from "./model";

function row(i: number, won: boolean, over: Partial<LeadFeatureRow> = {}): LeadFeatureRow {
  return {
    contact_id: `c${i}`,
    label: won ? 1 : 0,
    source: won ? "indicacao" : "anuncio",
    has_email: true,
    has_phone: won,
    has_company: i % 2 === 0,
    company_size: null,
    industry: null,
    platform: "whatsapp",
    inbound: won ? 8 : 1,
    outbound: 3,
    meetings: won ? 1 : 0,
    forms: 0,
    temperature: null,
    age_days: 10,
    ...over,
  };
}

const rows = Array.from({ length: 40 }, (_, i) => row(i, i % 2 === 0));

describe("featurize", () => {
  it("contagem em log, categórico vira chave", () => {
    const x = featurize(row(1, true));
    expect(x["source:indicacao"]).toBe(1);
    expect(x["inbound"]).toBeCloseTo(Math.log1p(8));
    expect(x["replied"]).toBe(1);
  });
  it("rótulo legível", () => {
    expect(featureLabel("source:indicacao")).toBe("Origem: indicacao");
    expect(featureLabel("temp:hot")).toBe("Temperatura: quente");
    expect(featureLabel("meetings")).toBe("Reuniões marcadas");
  });
});

describe("canTrain", () => {
  it("exige volume e as duas classes", () => {
    expect(canTrain(rows.slice(0, 5)).ok).toBe(false);
    expect(canTrain(rows.map((r) => ({ ...r, label: 1 }))).reason).toMatch(/ganhos e/);
    expect(canTrain(rows).ok).toBe(true);
  });
});

describe("train e predict", () => {
  const { model, accuracy, samples, positives } = train(rows);

  it("aprende o padrão dos ganhos", () => {
    expect(samples).toBe(40);
    expect(positives).toBe(20);
    expect(accuracy).toBeGreaterThan(0.9);
  });

  it("lead parecido com quem fechou tem nota alta, e o contrário baixa", () => {
    const hot = predict(model, row(100, true));
    const cold = predict(model, row(101, false));
    expect(hot.score).toBeGreaterThan(70);
    expect(cold.score).toBeLessThan(30);
  });

  it("mostra até 3 fatores com direção", () => {
    const p = predict(model, row(100, true));
    expect(p.factors.length).toBeGreaterThan(0);
    expect(p.factors.length).toBeLessThanOrEqual(3);
    expect(p.factors.every((f) => f.direction === "up")).toBe(true);
    expect(p.factors[0]!.label).toBeTruthy();
  });

  it("categoria rara não entra no modelo", () => {
    const r = train([...rows, row(200, true, { source: "evento-unico" })]);
    expect(r.model.weights["source:evento-unico"]).toBeUndefined();
  });
});

describe("bestHour", () => {
  it("acha a hora com mais respostas e o dia dominante", () => {
    const r = bestHour([
      { hour: 10, dow: 2, n: 4 },
      { hour: 11, dow: 2, n: 2 },
      { hour: 19, dow: 5, n: 1 },
    ]);
    expect(r).toEqual({ hour: 10, dow: 2, samples: 7 });
  });
  it("pouca resposta não ensina nada", () => {
    expect(bestHour([{ hour: 9, dow: 1, n: 2 }])).toBeNull();
  });
});
