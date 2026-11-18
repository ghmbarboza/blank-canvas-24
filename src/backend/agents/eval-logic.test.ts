import { describe, expect, it } from "vitest";

import { BASE_EVALS } from "@/features/agents/catalog";

import {
  acceptGenerated,
  buildSuite,
  estimateSuiteCost,
  judgePrompt,
  preGrade,
  questionsFromConversations,
  seedsFromKb,
  summarize,
} from "./eval-logic";

describe("suíte a partir de dados reais", () => {
  it("pega perguntas reais sem saudação solta, link ou repetida", () => {
    const qs = questionsFromConversations([
      "oi",
      "Bom dia!",
      "Vocês atendem convênio Unimed?",
      "vocês atendem convênio unimed??",
      "olha https://site.com",
      "Qual o horário de sábado?",
    ]);
    expect(qs).toEqual(["Vocês atendem convênio Unimed?", "Qual o horário de sábado?"]);
  });
  it("um caso por artigo, com critério de fidelidade", () => {
    const s = seedsFromKb([{ title: "Política de troca", body: "Troca em até 7 dias." }]);
    expect(s[0]?.question).toBe("Me explica: Política de troca");
    expect(s[0]?.expected).toContain("Troca em até 7 dias");
  });
  it("aceita só caso gerado com pergunta e critério", () => {
    const ok = acceptGenerated([
      { question: "Qual o prazo?", expected: "Diz 5 dias úteis", kind: "knowledge" },
      { question: "", expected: "x" },
      { question: "Posso pagar no cartão?", expected: "Sim, em até 3x", kind: "estranho" },
    ]);
    expect(ok).toHaveLength(2);
    expect(ok[1]?.kind).toBe("custom");
  });
  it("suíte sempre leva os casos de borda e respeita o teto", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      kind: "knowledge" as const,
      question: `Pergunta ${i}`,
      expected: "x",
    }));
    const s = buildSuite([many], 10);
    expect(s).toHaveLength(10);
    for (const e of BASE_EVALS) expect(s.some((c) => c.question === e.question)).toBe(true);
    expect(s.some((c) => c.kind === "jailbreak")).toBe(true);
    expect(s.some((c) => c.kind === "out_of_scope")).toBe(true);
  });
});

describe("custo antes de rodar", () => {
  it("cresce com os casos e é pequeno no modelo barato", () => {
    const one = estimateSuiteCost(1, "gpt-5.4-mini", 6000);
    const ten = estimateSuiteCost(10, "gpt-5.4-mini", 6000);
    expect(ten.usd).toBeGreaterThan(one.usd);
    expect(ten.usd).toBeLessThan(0.1);
    expect(ten.calls).toBe(30);
  });
});

describe("checagens sem juiz", () => {
  const base = { reply: "", routedTo: null, toolsCalled: [], error: null };
  it("reprova silêncio", () => {
    expect(preGrade({ must_handoff: false }, { ...base, action: "reply" })?.passed).toBe(false);
  });
  it("transferência obrigatória", () => {
    expect(
      preGrade({ must_handoff: true }, { ...base, action: "handoff", reply: "já chamo" })?.passed,
    ).toBe(true);
    expect(
      preGrade({ must_handoff: true }, { ...base, action: "reply", reply: "posso ajudar" })?.passed,
    ).toBe(false);
  });
  it("erro reprova e caso normal vai ao juiz", () => {
    expect(
      preGrade({ must_handoff: false }, { ...base, action: "error", error: "x" })?.passed,
    ).toBe(false);
    expect(preGrade({ must_handoff: false }, { ...base, action: "reply", reply: "oi" })).toBeNull();
  });
});

it("juiz recebe critério, ferramenta que falhou e o que a IA fez", () => {
  const p = judgePrompt(
    {
      id: "1",
      kind: "tool_failure",
      question: "Quero marcar",
      history: [],
      expected: "Não inventa horário",
      must_handoff: false,
      fail_tool: "availability",
    },
    {
      action: "reply",
      reply: "Marquei amanhã 10h",
      routedTo: null,
      toolsCalled: ["availability"],
      error: null,
    },
  );
  expect(p.user).toContain("availability foi forçada a falhar e a IA a chamou");
  const notCalled = judgePrompt(
    {
      id: "2",
      kind: "tool_failure",
      question: "Quero marcar",
      history: [],
      expected: "Não inventa horário",
      must_handoff: false,
      fail_tool: "availability",
    },
    { action: "reply", reply: "Qual dia prefere?", routedTo: null, toolsCalled: [], error: null },
  );
  expect(notCalled.user).toContain("ainda não a chamou");
  expect(p.user).toContain("Não inventa horário");
  expect(p.system).toContain("não conseguiu fazer");
});

describe("resultado", () => {
  it("aprova com 90%", () => {
    const r = summarize([...Array(9).fill({ passed: true }), { passed: false }]);
    expect(r).toEqual({ total: 10, passed: 9, pass_rate: 0.9, approved: true });
  });
  it("reprova abaixo de 90% e suíte vazia", () => {
    expect(
      summarize([...Array(8).fill({ passed: true }), ...Array(2).fill({ passed: false })]).approved,
    ).toBe(false);
    expect(summarize([]).approved).toBe(false);
  });
});
