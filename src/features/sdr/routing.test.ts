import { describe, expect, it } from "vitest";

import {
  describeRule,
  routeLead,
  ruleMatches,
  stateFromPhone,
  type LeadInfo,
  type RoutingRule,
} from "./routing";

const rule = (over: Partial<RoutingRule>): RoutingRule => ({
  id: "r",
  name: "r",
  position: 0,
  is_active: true,
  match: {},
  mode: "round_robin",
  user_ids: ["a", "b", "c"],
  rr_cursor: 0,
  ...over,
});

const lead: LeadInfo = {
  state: "SP",
  city: "Campinas",
  segment: "Clínica odontológica",
  source: "form",
  size: null,
};

describe("stateFromPhone", () => {
  it("lê o DDD com e sem 55", () => {
    expect(stateFromPhone("+55 (11) 98765-4321")).toBe("SP");
    expect(stateFromPhone("4899998888")).toBe("SC");
    expect(stateFromPhone("123")).toBeNull();
  });
});

describe("ruleMatches", () => {
  it("todos os filtros preenchidos precisam casar; segmento por trecho e sem acento", () => {
    expect(ruleMatches(rule({ match: { states: ["sp"], segments: ["odontologica"] } }), lead)).toBe(
      true,
    );
    expect(ruleMatches(rule({ match: { states: ["RJ"] } }), lead)).toBe(false);
    expect(ruleMatches(rule({ match: { sizes: ["grande"] } }), lead)).toBe(false);
    expect(ruleMatches(rule({}), lead)).toBe(true);
  });
});

describe("routeLead", () => {
  it("primeira regra ativa que casa, por posição", () => {
    const r = routeLead(
      [
        rule({ id: "geral", position: 2 }),
        rule({ id: "sp", position: 1, match: { states: ["SP"] }, mode: "user", user_ids: ["x"] }),
        rule({ id: "off", position: 0, is_active: false, user_ids: ["z"] }),
      ],
      lead,
    );
    expect(r).toMatchObject({ userId: "x", usesCursor: false });
    expect(r!.rule.id).toBe("sp");
  });

  it("rodízio usa o cursor", () => {
    expect(routeLead([rule({ rr_cursor: 4 })], lead)!.userId).toBe("b");
  });

  it("regra sem vendedor é ignorada; nada casa → null", () => {
    expect(routeLead([rule({ user_ids: [] })], lead)).toBeNull();
    expect(routeLead([rule({ match: { states: ["BA"] } })], lead)).toBeNull();
  });

  it("descreve a regra para leigo", () => {
    expect(describeRule(rule({ match: { states: ["SP", "RJ"], segments: ["saúde"] } }))).toBe(
      "SP, RJ · segmento saúde · rodízio entre 3",
    );
  });
});
