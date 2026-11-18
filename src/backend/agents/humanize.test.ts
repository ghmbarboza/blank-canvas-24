import { describe, expect, it } from "vitest";

import {
  asksIfRobot,
  checkSurveyScore,
  splitMessage,
  stripRepeatedGreeting,
  toneHints,
  tonePrompt,
  typingDelayMs,
} from "./humanize";

describe("splitMessage", () => {
  it("frase um pouco maior que o limite vai inteira, sem palavra sobrando sozinha", () => {
    const t =
      "Olá! Vou verificar essa informação sobre convênios com a nossa equipe e já te transfiro para um atendente.";
    const parts = splitMessage(t, 90);
    expect(parts).toEqual([
      "Olá!",
      "Vou verificar essa informação sobre convênios com a nossa equipe e já te transfiro para um atendente.",
    ]);
  });
  it("frase enorme vira pedaços parecidos, nenhum miúdo", () => {
    const t = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(" ") + ".";
    const parts = splitMessage(t, 90);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeGreaterThan(40);
  });
  it("devolve uma parte quando cabe", () => {
    expect(splitMessage("Oi, tudo certo?", 280)).toEqual(["Oi, tudo certo?"]);
  });
  it("quebra por parágrafo e depois por frase", () => {
    const text =
      "Primeira ideia.\n\nSegunda ideia bem maior que cabe sozinha. Com outra frase aqui no meio. E mais uma no fim.";
    const parts = splitMessage(text, 60);
    expect(parts[0]).toBe("Primeira ideia.");
    expect(parts.every((p) => p.length <= 60)).toBe(true);
    expect(parts.length).toBeGreaterThan(2);
  });
  it("corta frase sem pontuação no espaço, perto do limite e sem sobra miúda", () => {
    const parts = splitMessage("palavra ".repeat(40), 80);
    expect(parts.every((p) => p.length <= 80 * 1.25 && p.length >= 40)).toBe(true);
  });
  it("nunca manda mais de 4 mensagens seguidas", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Frase número ${i} com texto.`).join("\n\n");
    expect(splitMessage(text, 60)).toHaveLength(4);
  });
  it("vazio vira nada", () => {
    expect(splitMessage("   ", 100)).toEqual([]);
  });
});

describe("typingDelayMs", () => {
  it("é proporcional com piso e teto", () => {
    expect(typingDelayMs("oi", { ms_per_char: 30, max_delay_ms: 5000 })).toBe(600);
    expect(typingDelayMs("x".repeat(100), { ms_per_char: 30, max_delay_ms: 5000 })).toBe(3000);
    expect(typingDelayMs("x".repeat(1000), { ms_per_char: 30, max_delay_ms: 5000 })).toBe(5000);
  });
  it("desligado é zero", () => {
    expect(typingDelayMs("texto", { ms_per_char: 30, max_delay_ms: 0 })).toBe(0);
  });
});

describe("tom do cliente", () => {
  it("formal sem gíria", () => {
    const h = toneHints(["Prezado, gostaria de saber o prazo de entrega, por gentileza."]);
    expect(h.formal).toBe(true);
    expect(tonePrompt(h)).toContain("formalidade");
  });
  it("curto com emoji", () => {
    const h = toneHints(["oi 😊", "qnto custa?"]);
    expect(h.short).toBe(true);
    expect(h.usesEmoji).toBe(true);
    expect(tonePrompt(h)).toContain("um emoji");
  });
  it("sem emoji pede para não usar", () => {
    expect(tonePrompt(toneHints(["quero saber do plano anual"]))).toContain("Não use emoji");
  });
});

describe("saudação repetida", () => {
  it("tira o cumprimento quando já cumprimentou", () => {
    expect(stripRepeatedGreeting("Olá! Tudo bem? O plano custa R$ 99.", true)).toBe(
      "O plano custa R$ 99.",
    );
  });
  it("mantém na primeira resposta", () => {
    expect(stripRepeatedGreeting("Olá! Como posso ajudar?", false)).toBe("Olá! Como posso ajudar?");
  });
  it("não apaga a mensagem inteira", () => {
    expect(stripRepeatedGreeting("Bom dia!", true)).toBe("Bom dia!");
  });
});

describe("é robô?", () => {
  it.each([
    "você é um robô?",
    "vc é bot?",
    "to falando com uma pessoa?",
    "é robô?",
    "você é humana?",
  ])("%s", (q) => expect(asksIfRobot(q)).toBe(true));
  it("não confunde com assunto comum", () => {
    expect(asksIfRobot("vocês vendem robô aspirador?")).toBe(false);
  });
});

describe("nota da pesquisa", () => {
  it("aceita nota dita em número", () => {
    expect(checkSurveyScore("nps", 9, "uns 9, só o prazo que podia melhorar").ok).toBe(true);
  });
  it("aceita nota por extenso", () => {
    expect(checkSurveyScore("nps", 10, "dou dez fácil").ok).toBe(true);
  });
  it("barra nota que o cliente não disse", () => {
    expect(checkSurveyScore("nps", 10, "foi tranquilo").ok).toBe(false);
  });
  it("barra fora da escala", () => {
    expect(checkSurveyScore("csat", 9, "9").ok).toBe(false);
  });
  it("csat em palavras", () => {
    expect(checkSurveyScore("csat", 5, "atendimento excelente").ok).toBe(true);
  });
});
