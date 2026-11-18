import { describe, expect, it } from "vitest";

import { ruleToFilter, segmentToOr } from "./rules";

describe("regras de segmento", () => {
  it("converte igualdade, vazio e faixa de score", () => {
    expect(ruleToFilter({ field: "temperature", op: "eq", value: "hot" })).toBe(
      "temperature.eq.hot",
    );
    expect(ruleToFilter({ field: "owner", op: "is_empty" })).toBe("owner_user_id.is.null");
    expect(ruleToFilter({ field: "score", op: "gte", value: 60 })).toBe("score.gte.60");
  });
  it("etiqueta usa contém no array, com aspas quando precisa", () => {
    expect(ruleToFilter({ field: "tag", op: "has", value: "vip" })).toBe("tags.cs.{vip}");
    expect(ruleToFilter({ field: "tag", op: "not_has", value: "a,b" })).toBe('tags.not.cs.{"a,b"}');
  });
  it("ignora regra incompleta em vez de filtrar tudo", () => {
    expect(ruleToFilter({ field: "lifecycle", op: "eq", value: "" })).toBeNull();
    expect(
      segmentToOr({ match: "all", rules: [{ field: "lifecycle", op: "eq", value: "" }] }),
    ).toBeNull();
  });
  it("todas = and(...); qualquer = lista do or()", () => {
    const rules = [
      { field: "temperature", op: "eq", value: "hot" },
      { field: "lifecycle", op: "eq", value: "lead" },
    ] as const;
    expect(segmentToOr({ match: "all", rules: [...rules] })).toBe(
      "and(temperature.eq.hot,lifecycle.eq.lead)",
    );
    expect(segmentToOr({ match: "any", rules: [...rules] })).toBe(
      "temperature.eq.hot,lifecycle.eq.lead",
    );
  });
  it("campo personalizado consulta o JSON", () => {
    expect(ruleToFilter({ field: "custom.segmento", op: "eq", value: "Varejo" })).toBe(
      "custom->>segmento.eq.Varejo",
    );
  });
});
