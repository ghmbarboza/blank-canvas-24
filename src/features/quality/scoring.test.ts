import { describe, expect, it } from "vitest";

import {
  QUALITY_TEMPLATES,
  agreement,
  computeScore,
  evidenceFound,
  mergeAiItems,
  normalizeCriteria,
  type QualityCriterion,
} from "./scoring";

const criteria: QualityCriterion[] = [
  { id: "entendeu", label: "Entendeu", description: "", weight: 3, eliminatory: false },
  { id: "resolveu", label: "Resolveu", description: "", weight: 1, eliminatory: false },
  { id: "promessa", label: "Sem promessa indevida", description: "", weight: 1, eliminatory: true },
];
const transcript =
  "Cliente: meu pedido não chegou\nAtendente: Entendi, vou verificar o rastreio agora. Garanto que chega amanhã sem falta!";

describe("normalizeCriteria", () => {
  it("gera id, limita peso e ignora critério sem nome", () => {
    const r = normalizeCriteria([
      { label: "Cumprimentou o cliente", weight: 99 },
      { label: "" },
      { label: "Cumprimentou o cliente", weight: 0, eliminatory: 1 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: "cumprimentou_o_cliente", weight: 10, eliminatory: false });
    expect(r[1]!.id).toBe("cumprimentou_o_cliente_2");
    expect(r[1]).toMatchObject({ weight: 1, eliminatory: true });
  });

  it("recusa lista vazia com mensagem para leigo", () => {
    expect(() => normalizeCriteria([])).toThrow(/pelo menos um critério/);
    expect(() => normalizeCriteria("x")).toThrow(/formato inválido/);
  });

  it("os modelos prontos são válidos", () => {
    for (const t of QUALITY_TEMPLATES)
      expect(normalizeCriteria(t.criteria)).toHaveLength(t.criteria.length);
  });
});

describe("computeScore", () => {
  it("faz média ponderada só dos critérios não eliminatórios", () => {
    const r = computeScore([
      { score: 100, weight: 3, eliminatory: false, passed: true },
      { score: 0, weight: 1, eliminatory: false, passed: false },
      { score: 100, weight: 1, eliminatory: true, passed: true },
    ]);
    expect(r).toEqual({ score: 75, eliminated: false });
  });

  it("zera a nota quando um eliminatório reprova", () => {
    expect(
      computeScore([
        { score: 100, weight: 3, eliminatory: false, passed: true },
        { score: 0, weight: 1, eliminatory: true, passed: false },
      ]),
    ).toEqual({ score: 0, eliminated: true });
  });
});

describe("evidenceFound", () => {
  it("acha o trecho ignorando acento e pontuação", () => {
    expect(evidenceFound("garanto que chega amanha sem falta", transcript)).toBe(true);
  });
  it("recusa trecho inventado", () => {
    expect(evidenceFound("posso te dar 50% de desconto", transcript)).toBe(false);
  });
});

describe("mergeAiItems", () => {
  it("só reprova eliminatório com trecho verificado e calcula passou pelo corte", () => {
    const items = mergeAiItems(
      criteria,
      [
        { criterion_id: "entendeu", score: 90, evidence: "vou verificar o rastreio agora" },
        { criterion_id: "promessa", passed: false, evidence: "Garanto que chega amanhã sem falta" },
      ],
      transcript,
    );
    expect(items[0]).toMatchObject({ score: 90, passed: true, evidence_verified: true });
    // Esquecido pela IA: nota 0 e aviso.
    expect(items[1]).toMatchObject({
      score: 0,
      passed: false,
      comment: "A IA não avaliou este critério",
    });
    expect(items[2]).toMatchObject({ passed: false, score: 0, evidence_verified: true });
    expect(computeScore(items).eliminated).toBe(true);
  });

  it("eliminatório sem prova não elimina", () => {
    const items = mergeAiItems(
      criteria,
      [{ criterion_id: "promessa", passed: false, evidence: "frase que não existe na conversa" }],
      transcript,
    );
    expect(items[2]).toMatchObject({ passed: true, evidence: "", evidence_verified: false });
  });
});

describe("agreement", () => {
  it("conta critério que concorda dentro da tolerância e no mesmo veredito", () => {
    const ai = [
      { criterion_id: "a", score: 80, passed: true },
      { criterion_id: "b", score: 40, passed: false },
      { criterion_id: "c", score: 90, passed: true },
    ];
    const mgr = [
      { criterion_id: "a", score: 90, passed: true },
      { criterion_id: "b", score: 80, passed: true },
      { criterion_id: "c", score: 70, passed: true },
      { criterion_id: "x", score: 10, passed: false },
    ];
    expect(agreement(ai, mgr)).toBe(33.3);
    expect(agreement(ai, [])).toBe(0);
  });
});

describe("canais de qualidade por edição", () => {
  it("edição atual só avalia conversa; a completa volta com ligação e e-mail", async () => {
    const { EDITION, FULL_EDITION } = await import("@/lib/edition");
    const { qualityChannelsFor } = await import("./scoring");
    expect(qualityChannelsFor(EDITION)).toEqual(["chat"]);
    expect(qualityChannelsFor(FULL_EDITION)).toEqual(["call", "chat", "email"]);
  });
});
