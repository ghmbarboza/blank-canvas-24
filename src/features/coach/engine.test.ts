import { describe, expect, it } from "vitest";

import { TEMPLATE_PLAYBOOK as pb } from "@/features/playbooks/template";

import {
  INITIAL_STATE,
  matches,
  pendingItems,
  processUtterance,
  progress,
  type CoachState,
} from "./engine";

const say = (state: CoachState, text: string, isSeller: boolean, startMs: number, endMs: number) =>
  processUtterance(state, pb, { text, isSeller, startMs, endMs });

describe("motor do livecoach", () => {
  it("casa gatilho sem acento e sem pegar pedaço de palavra", () => {
    expect(matches("Achei MUITO caro, sinceramente", ["muito caro"])).toBe("muito caro");
    expect(matches("O orçamento está aprovado", ["orcamento"])).toBe("orcamento");
    expect(matches("escarola", ["caro"])).toBeNull();
  });

  it("objeção do cliente gera dica com resposta e prova, uma vez por janela", () => {
    const a = say(INITIAL_STATE, "Achei caro", false, 0, 2000);
    expect(a.tips.map((t) => t.kind)).toEqual(["objection"]);
    expect(a.tips[0]!.body).toContain("Prova:");
    const b = say(a.state, "continua caro", false, 3000, 5000);
    expect(b.tips).toEqual([]);
    const c = say(b.state, "é caro mesmo", false, 200_000, 202_000);
    expect(c.tips.map((t) => t.key)).toEqual(["objection:caro"]);
  });

  it("vendedor cobre item do checklist pela palavra-chave", () => {
    const r = say(INITIAL_STATE, "Qual o orçamento que vocês têm para isso?", true, 0, 3000);
    expect(r.state.covered).toContain("orcamento");
    expect(pendingItems(r.state, pb).map((p) => p.id)).not.toContain("orcamento");
    expect(progress(r.state, pb)).toBeGreaterThan(0);
  });

  it("sinal de compra e concorrente viram dicas próprias", () => {
    const r = say(
      INITIAL_STATE,
      "Hoje a gente usa planilha. Qual o próximo passo?",
      false,
      0,
      3000,
    );
    expect(r.tips.map((t) => t.kind).sort()).toEqual(["battlecard", "closing"]);
  });

  it("frase proibida do vendedor gera alerta de compliance", () => {
    const r = say(INITIAL_STATE, "Eu garanto resultado em 30 dias", true, 0, 2000);
    expect(r.tips.some((t) => t.kind === "compliance")).toBe(true);
  });

  it("monólogo longo e fala desbalanceada viram dica de ritmo", () => {
    const r = say(INITIAL_STATE, "deixa eu te explicar tudo", true, 0, 200_000);
    expect(r.tips.map((t) => t.key)).toEqual(
      expect.arrayContaining(["pace:monologue", "pace:ratio"]),
    );
  });

  it("depois de alguns minutos lembra o próximo item obrigatório", () => {
    const r = say(INITIAL_STATE, "ok", false, 600_000, 601_000);
    expect(r.tips.some((t) => t.kind === "checklist")).toBe(true);
  });
});
