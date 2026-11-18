import { describe, expect, it } from "vitest";

import { bestHourHeat, nextInRotation, ruleCondition, topModelFactors } from "./insights";

describe("topModelFactors", () => {
  it("ordena pelo peso absoluto e devolve a parte de cada um", () => {
    const f = topModelFactors({
      weights: { replied: 3, has_email: -1, meetings: 1, zero: 0 },
      labels: { replied: "Respondeu as mensagens" },
    });
    expect(f.map((x) => x.key)).toEqual(["replied", "has_email", "meetings"]);
    expect(f[0]).toMatchObject({ label: "Respondeu as mensagens", share: 60, direction: "up" });
    expect(f[1]).toMatchObject({ label: "Tem e-mail", direction: "down", share: 20 });
  });

  it("modelo vazio ou não treinado não tem fator", () => {
    expect(topModelFactors({})).toEqual([]);
    expect(topModelFactors(null)).toEqual([]);
  });
});

describe("bestHourHeat", () => {
  it("conta por dia e hora e acha o pico, ignorando fora da janela", () => {
    const h = bestHourHeat([
      { best_hour: 10, best_dow: 2 },
      { best_hour: 10, best_dow: 2 },
      { best_hour: 15, best_dow: 0 },
      { best_hour: 3, best_dow: 1 },
      { best_hour: null, best_dow: null },
    ]);
    expect(h.total).toBe(3);
    expect(h.max).toBe(2);
    expect(h.peak).toEqual({ dow: 2, hour: 10 });
  });
});

describe("ruleCondition e nextInRotation", () => {
  it("escreve a condição em português", () => {
    expect(ruleCondition({ states: ["SP", "RJ", "MG"], segments: ["varejo"] })).toBe(
      "Se o estado for SP, RJ ou MG e o segmento for varejo",
    );
    expect(ruleCondition({})).toBeNull();
  });

  it("segue o cursor do rodízio", () => {
    expect(nextInRotation({ mode: "round_robin", user_ids: ["a", "b", "c"], rr_cursor: 4 })).toBe(
      "b",
    );
    expect(nextInRotation({ mode: "user", user_ids: ["z"], rr_cursor: 9 })).toBe("z");
    expect(nextInRotation({ mode: "round_robin", user_ids: [], rr_cursor: 0 })).toBeNull();
  });
});
