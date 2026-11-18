import { describe, expect, it } from "vitest";

import { createRuleEngine, talkRatio } from "./rules";

describe("coach por regras", () => {
  it("reconhece objeção de preço do cliente e não repete em 90 s", () => {
    const e = createRuleEngine();
    expect(
      e
        .push({ speaker: "customer", text: "Achei que tá caro", final: true, at: 1000 })
        .map((t) => t.title),
    ).toEqual(["Objeção de preço"]);
    expect(
      e.push({ speaker: "customer", text: "muito caro mesmo", final: true, at: 30_000 }),
    ).toEqual([]);
    expect(
      e.push({ speaker: "customer", text: "continua caro demais", final: true, at: 120_000 }),
    ).toHaveLength(1);
  });
  it("ignora texto parcial e fala do vendedor para objeção", () => {
    const e = createRuleEngine();
    expect(e.push({ speaker: "customer", text: "tá caro", final: false, at: 0 })).toEqual([]);
    expect(e.push({ speaker: "seller", text: "sei que parece caro", final: true, at: 0 })).toEqual(
      [],
    );
  });
  it("sinal de compra e alerta de promessa do vendedor", () => {
    const e = createRuleEngine();
    expect(
      e.push({ speaker: "customer", text: "qual o próximo passo?", final: true, at: 0 })[0]?.kind,
    ).toBe("closing");
    expect(
      e.push({ speaker: "seller", text: "eu garanto o resultado", final: true, at: 0 })[0]?.kind,
    ).toBe("compliance");
  });
  it("avisa quando o vendedor monopoliza a conversa", () => {
    const e = createRuleEngine();
    const long = "x".repeat(1600);
    e.push({ speaker: "customer", text: "oi", final: true, at: 0 });
    const tips = e.push({ speaker: "seller", text: long, final: true, at: 1000 });
    expect(tips.some((t) => t.kind === "pace")).toBe(true);
    expect(
      talkRatio([
        { speaker: "seller", text: "aaa", final: true, at: 0 },
        { speaker: "customer", text: "a", final: true, at: 0 },
      ]),
    ).toBe(0.75);
  });
});
