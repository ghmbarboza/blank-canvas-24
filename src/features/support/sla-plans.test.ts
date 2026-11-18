import { describe, expect, it } from "vitest";

import {
  buildTargets,
  describeRule,
  hoursToMinutes,
  matchSlaRule,
  minutesToHours,
  type SlaPlanRuleLike,
} from "./sla-plans";

const rule = (p: Partial<SlaPlanRuleLike>): SlaPlanRuleLike => ({
  id: p.id ?? "r",
  name: p.name ?? "Plano",
  match_kind: p.match_kind ?? "tag",
  match_field: p.match_field ?? null,
  match_value: p.match_value ?? "ouro",
  applies_to: p.applies_to ?? "any",
  position: p.position ?? 0,
  is_active: p.is_active ?? true,
  created_at: p.created_at ?? "2026-10-01",
});

describe("horas do formulário", () => {
  it("converte horas em minutos", () => {
    expect(hoursToMinutes("1,5")).toBe(90);
    expect(hoursToMinutes("2")).toBe(120);
    expect(hoursToMinutes("")).toBeNull();
    expect(hoursToMinutes("0")).toBe("invalid");
    expect(hoursToMinutes("abc")).toBe("invalid");
    expect(hoursToMinutes("5000")).toBe("invalid");
    expect(minutesToHours(90)).toBe("1,5");
    expect(minutesToHours(120)).toBe("2");
    expect(minutesToHours(undefined)).toBe("");
  });
  it("monta as metas só das prioridades preenchidas", () => {
    expect(
      buildTargets({
        urgent: { first: "0,25", resolution: "2" },
        normal: { first: "", resolution: "" },
        low: { first: "", resolution: "48" },
      }),
    ).toEqual({
      ok: true,
      targets: { urgent: { first: 15, resolution: 120 }, low: { resolution: 2880 } },
    });
  });
  it("recusa vazio total e valor inválido", () => {
    expect(buildTargets({ urgent: { first: "", resolution: "" } }).ok).toBe(false);
    expect(buildTargets({ urgent: { first: "-1", resolution: "" } }).ok).toBe(false);
  });
});

describe("qual regra vale para o cliente", () => {
  it("casa etiqueta sem diferenciar maiúscula e espaço", () => {
    const r = rule({ match_value: " Ouro " });
    expect(matchSlaRule([r], { tags: ["vip", "OURO"] }, null)).toBe(r);
    expect(matchSlaRule([r], { tags: ["prata"] }, null)).toBeNull();
  });
  it("casa campo personalizado da empresa", () => {
    const r = rule({ match_kind: "field", match_field: "plano", match_value: "Enterprise" });
    expect(matchSlaRule([r], { custom: {} }, { custom: { plano: "enterprise" } })).toBe(r);
  });
  it("respeita onde procurar", () => {
    const soEmpresa = rule({ applies_to: "company" });
    expect(matchSlaRule([soEmpresa], { tags: ["ouro"] }, { tags: [] })).toBeNull();
    expect(matchSlaRule([soEmpresa], null, { tags: ["ouro"] })).toBe(soEmpresa);
  });
  it("a de menor posição ganha e inativa é ignorada", () => {
    const a = rule({ id: "a", position: 2 });
    const b = rule({ id: "b", position: 1 });
    const off = rule({ id: "off", position: 0, is_active: false });
    expect(matchSlaRule([a, b, off], { tags: ["ouro"] }, null)?.id).toBe("b");
  });
  it("descreve a condição em português", () => {
    expect(describeRule(rule({}))).toBe('etiqueta "ouro"');
    expect(
      describeRule(
        rule({
          match_kind: "field",
          match_field: "plano",
          match_value: "Pro",
          applies_to: "company",
        }),
      ),
    ).toBe('campo "plano" igual a "Pro" na empresa');
  });
});
