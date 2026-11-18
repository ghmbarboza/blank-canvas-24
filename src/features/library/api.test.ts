import { describe, expect, it } from "vitest";

import { lastWeeks, mentionSeries } from "./api";

describe("biblioteca", () => {
  it("lista as segundas-feiras das últimas semanas em ordem", () => {
    const w = lastWeeks(3, new Date("2026-10-21T12:00:00Z")); // quarta
    expect(w).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("monta a série semanal com zeros e ordena pelo total", () => {
    const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"];
    const s = mentionSeries(
      [
        { term_id: "a", term: "preço", category: "price", week: "2026-10-12", mentions: 2 },
        { term_id: "b", term: "RD", category: "competitor", week: "2026-10-05", mentions: 1 },
        { term_id: "a", term: "preço", category: "price", week: "2026-10-19", mentions: 3 },
      ],
      weeks,
    );
    expect(s[0]).toMatchObject({ id: "a", total: 5, series: [0, 2, 3] });
    expect(s[1]).toMatchObject({ id: "b", total: 1, series: [1, 0, 0] });
  });
});
