import { describe, expect, it } from "vitest";

import {
  agentSettings,
  checkReply,
  gradeEval,
  moneyValues,
  needsHuman,
  withinBusinessHours,
} from "./agent-logic";

describe("trava do agente de IA", () => {
  it("transfere quando pedem gente, cancelamento ou estão irritados", () => {
    expect(needsHuman("quero falar com um atendente")).toBe("pediu atendimento humano");
    expect(needsHuman("vou abrir reclamação no Procon")).toBe("menção a reclamação formal");
    expect(needsHuman("quero cancelar meu plano")).toBe("cancelamento ou reembolso");
    expect(needsHuman("que serviço péssimo")).toBe("cliente irritado");
    expect(needsHuman("qual o horário de vocês?")).toBeNull();
  });
  it("lê valores em reais", () => {
    expect(moneyValues("Custa R$ 1.234,50 ou R$99")).toEqual([1234.5, 99]);
  });
  it("barra preço fora do catálogo e promessa de prazo", () => {
    expect(checkReply("O plano sai por R$ 100,00 ao mês.", [100]).ok).toBe(true);
    const r = checkReply("Faço por R$ 80,00 e garanto entrega até amanhã.", [100]);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(["preço fora do catálogo: R$ 80.00", "promessa de prazo"]);
  });
  it("horário de atendimento no fuso da conta", () => {
    const monday14 = new Date("2026-10-26T17:00:00Z"); // 14h em São Paulo
    const sunday = new Date("2026-10-25T15:00:00Z");
    expect(
      withinBusinessHours(monday14, "America/Sao_Paulo", {
        days: [1, 2, 3, 4, 5],
        start: "09:00",
        end: "18:00",
      }),
    ).toBe(true);
    expect(withinBusinessHours(sunday, "America/Sao_Paulo", { days: [1, 2, 3, 4, 5] })).toBe(false);
    expect(withinBusinessHours(sunday, "America/Sao_Paulo", null)).toBe(true);
  });
  it("corrige a suíte de avaliação", () => {
    expect(
      gradeEval(
        { expected: "segunda via; área do cliente", must_handoff: false },
        { handoff: false, reply: "Na Área do Cliente tem a segunda via." },
      ).passed,
    ).toBe(true);
    expect(
      gradeEval({ expected: null, must_handoff: true }, { handoff: false, reply: "ok" }).passed,
    ).toBe(false);
    expect(
      gradeEval({ expected: "pix", must_handoff: false }, { handoff: false, reply: "boleto" })
        .reason,
    ).toBe("faltou: pix");
  });
  it("mescla configuração com o padrão", () => {
    expect(agentSettings({ enabled: true }).debounce_seconds).toBe(2);
    expect(agentSettings(null).enabled).toBe(false);
  });
});
