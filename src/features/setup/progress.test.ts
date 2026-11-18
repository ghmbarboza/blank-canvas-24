import { describe, expect, it } from "vitest";

import {
  laterSteps,
  mainSteps,
  nextStepId,
  progressOf,
  stepStatus,
  type RoteiroView,
} from "./progress";

const step = (id: string, done: boolean, extra: Partial<RoteiroView["steps"][number]> = {}) => ({
  id,
  title: id,
  required: false,
  done,
  skipped: false,
  ...extra,
});

const view = (done: string[], current: string | null): RoteiroView => ({
  steps: [
    ...["empresa", "canal", "conhecimento", "agente", "regras", "teste"].map((id) =>
      step(id, done.includes(id), { required: id === "empresa" || id === "canal" }),
    ),
    step("equipe", done.includes("equipe"), { later: true }),
  ],
  current,
  requiredPending: 0,
  remaining: 0,
});

describe("passo a passo do primeiro acesso", () => {
  it("a barra conta só os seis passos principais", () => {
    const r = view(["empresa", "canal", "equipe"], "conhecimento");
    expect(mainSteps(r)).toHaveLength(6);
    expect(laterSteps(r).map((s) => s.id)).toEqual(["equipe"]);
    expect(progressOf(r)).toEqual({ done: 2, total: 6, pct: 33 });
  });

  it("o próximo clique é o passo atual do servidor", () => {
    const r = view(["empresa"], "canal");
    expect(nextStepId(r)).toBe("canal");
    expect(stepStatus(r, "empresa")).toBe("feito");
    expect(stepStatus(r, "canal")).toBe("agora");
    expect(stepStatus(r, "teste")).toBe("depois");
  });

  it("se a pessoa pulou o atual, o próximo é o primeiro que ainda não está feito", () => {
    const r = view(["empresa", "canal"], null);
    expect(nextStepId(r)).toBe("conhecimento");
  });

  it("tudo feito: 100% e nenhum próximo passo", () => {
    const r = view(["empresa", "canal", "conhecimento", "agente", "regras", "teste"], null);
    expect(progressOf(r).pct).toBe(100);
    expect(nextStepId(r)).toBeNull();
  });
});
