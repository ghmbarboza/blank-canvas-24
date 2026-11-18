import { describe, expect, it } from "vitest";

import { conditionHolds, qualifiesForSchedule, scheduleRule } from "./schedule";

describe("regra de agenda do formulário", () => {
  it("normaliza o que vem do banco", () => {
    expect(scheduleRule(null)).toMatchObject({
      enabled: false,
      match: "always",
      label: "Escolha um horário",
    });
    expect(
      scheduleRule({
        enabled: true,
        match: "all",
        conditions: [{ field: "", op: "equals" }],
        booking_slug: "",
      }),
    ).toMatchObject({ enabled: true, match: "all", conditions: [], booking_slug: null });
  });

  it("desligada nunca qualifica; 'sempre' qualifica todo envio", () => {
    expect(qualifiesForSchedule(scheduleRule({ enabled: false }), {})).toBe(false);
    expect(qualifiesForSchedule(scheduleRule({ enabled: true }), {})).toBe(true);
  });

  it("todas as condições precisam bater", () => {
    const rule = scheduleRule({
      enabled: true,
      match: "all",
      conditions: [
        { field: "porte", op: "equals", value: "Média empresa" },
        { field: "orcamento", op: "gte", value: "5000" },
      ],
    });
    expect(qualifiesForSchedule(rule, { porte: "media EMPRESA", orcamento: "R$ 7.500,00" })).toBe(
      true,
    );
    expect(qualifiesForSchedule(rule, { porte: "Média empresa", orcamento: "3000" })).toBe(false);
    expect(qualifiesForSchedule(rule, { porte: "Pequena", orcamento: "9000" })).toBe(false);
    expect(qualifiesForSchedule({ ...rule, conditions: [] }, {})).toBe(false);
  });

  it("operadores", () => {
    expect(
      conditionHolds({ field: "x", op: "contains", value: "crm" }, { x: "Quero um CRM novo" }),
    ).toBe(true);
    expect(conditionHolds({ field: "x", op: "contains", value: "" }, { x: "qualquer" })).toBe(
      false,
    );
    expect(conditionHolds({ field: "x", op: "not_equals", value: "não" }, { x: "Sim" })).toBe(true);
    expect(conditionHolds({ field: "n", op: "lte", value: "10" }, { n: "8" })).toBe(true);
    expect(conditionHolds({ field: "n", op: "gte", value: "10" }, { n: "abc" })).toBe(false);
    expect(conditionHolds({ field: "c", op: "equals", value: "a, b" }, { c: ["a", "b"] })).toBe(
      true,
    );
  });
});
