import { describe, expect, it } from "vitest";

import { briefingPrompt, normalizeBriefing, type BriefingInput } from "./briefing";

const base: BriefingInput = {
  title: "Demonstração · Ana",
  when: "quinta-feira, 23 de outubro, 14:00",
  contact: {
    name: "Ana Souza",
    company: "Padaria Sol",
    job_title: "Sócia",
    lifecycle: "lead",
    score: 72,
    ai_summary: "Quer automatizar pedidos pelo WhatsApp.",
    ai_next_step: null,
    notes: null,
  },
  deal: { title: "Padaria Sol", value: 1500, stage: "Proposta", status: "open" },
  answers: { objetivo: "Reduzir tempo de atendimento", vazio: "" },
  messages: [
    { direction: "in", body: "Quanto custa?", at: "2026-10-20T10:00:00Z" },
    { direction: "out", body: "Te mostro na reunião!", at: "2026-10-20T10:01:00Z" },
  ],
  previous: null,
  playbook: { name: "Padrão", questions: ["Quem decide?"], objections: ["Está caro"] },
};

describe("briefing da reunião", () => {
  it("leva contato, negócio, respostas, mensagens e playbook para a IA", () => {
    const p = briefingPrompt(base);
    expect(p).toContain("Ana Souza, Sócia na Padaria Sol");
    expect(p).toContain("etapa Proposta");
    expect(p).toContain("R$ 1500,00");
    expect(p).toContain("objetivo: Reduzir tempo");
    expect(p).not.toContain("vazio:");
    expect(p).toContain("CLIENTE: Quanto custa?");
    expect(p).toContain("EMPRESA: Te mostro");
    expect(p).toContain("Quem decide?");
  });

  it("diz quando falta contexto", () => {
    const p = briefingPrompt({ ...base, contact: null, deal: null, messages: [], answers: {} });
    expect(p).toContain("Contato: não vinculado.");
    expect(p).toContain("Sem mensagens trocadas ainda.");
  });

  it("normaliza a saída do modelo", () => {
    const b = normalizeBriefing({
      summary: " ok ",
      goal: "fechar",
      talking_points: ["a", "", "b", "c", "d", "e", "f"],
      questions: undefined,
      watch_out: ["x"],
    });
    expect(b.summary).toBe("ok");
    expect(b.talking_points).toEqual(["a", "b", "c", "d", "e"]);
    expect(b.questions).toEqual([]);
  });
});
