import { describe, expect, it } from "vitest";

import { TEMPLATE_PLAYBOOK, TEMPLATE_SCORECARD } from "@/features/playbooks/template";

import {
  coveredFromMessages,
  highlightParts,
  personaSystemPrompt,
  SAMPLE_PERSONAS,
  sanitizeEvaluation,
  toLlmMessages,
  weightedScore,
  type RoleplayMessage,
} from "./roleplay";

const msg = (role: "seller" | "persona", text: string): RoleplayMessage => ({ role, text, at: "" });

describe("roleplay", () => {
  it("o prompt da persona mantém o papel, as objeções e a dificuldade", () => {
    const p = personaSystemPrompt(SAMPLE_PERSONAS[2]!, null);
    expect(p).toContain("Nunca saia do papel");
    expect(p).toContain("Já usamos RD Station");
    expect(p).toContain("cético");
  });

  it("para o modelo, o vendedor é o usuário e a persona é o assistente", () => {
    expect(toLlmMessages([msg("persona", "oi"), msg("seller", "olá")]).map((m) => m.role)).toEqual([
      "assistant",
      "user",
    ]);
  });

  it("marca no roteiro só o que o VENDEDOR falou", () => {
    const covered = coveredFromMessages(TEMPLATE_PLAYBOOK, [
      msg("persona", "a reunião está sendo gravada?"),
      msg("seller", "Qual o maior desafio de vocês hoje?"),
    ]).covered;
    expect(covered).toContain("dor");
    expect(covered).not.toContain("gravacao");
  });

  it("nota ponderada vai de 0 a 100", () => {
    const crit = [
      { id: "a", label: "A", weight: 3 },
      { id: "b", label: "B", weight: 1 },
    ];
    expect(
      weightedScore(
        [
          { id: "a", label: "A", score: 10, quote: "", comment: "" },
          { id: "b", label: "B", score: 0, quote: "", comment: "" },
        ],
        crit,
      ),
    ).toBe(75);
    expect(weightedScore([], crit)).toBe(0);
  });

  it("descarta citação inventada, nota fora do intervalo e critério que não existe", () => {
    const crit = TEMPLATE_SCORECARD.criteria;
    const out = sanitizeEvaluation(
      {
        criteria: [
          { id: crit[0]!.id, score: 14, quote: "qual o maior desafio hoje", comment: "boa" },
          { id: "inventado", score: 10, quote: "x", comment: "y" },
          { id: crit[1]!.id, score: 5, quote: "frase que ninguém disse", comment: "" },
        ],
        strengths: ["a", "b", "c", "d"],
        improvements: ["x"],
        feedback: " ok ",
      },
      crit,
      [msg("seller", "Qual o maior desafio hoje?")],
    );
    expect(out.scores).toHaveLength(crit.length);
    expect(out.scores[0]!.score).toBe(10);
    expect(out.scores[0]!.quote).toBe("qual o maior desafio hoje");
    expect(out.scores[1]!.quote).toBe("");
    expect(out.strengths).toHaveLength(3);
    expect(out.feedback).toBe("ok");
  });

  it("destaca o termo ignorando acento e caixa", () => {
    expect(
      highlightParts("Achei o PRECO caro", "preço")
        .filter((p) => p.hit)
        .map((p) => p.text),
    ).toEqual(["PRECO"]);
    expect(highlightParts("sem nada", "x")).toEqual([{ text: "sem nada", hit: false }]);
  });
});
