import { describe, expect, it } from "vitest";

import { at, coverageFromShifts } from "./coverage";

describe("coverageFromShifts", () => {
  it("conta a pessoa em cada hora que o turno toca", () => {
    const day = "2026-10-28";
    const c = coverageFromShifts(
      [
        { starts_at: at(day, 9).toISOString(), ends_at: at(day, 12).toISOString() },
        { starts_at: at(day, 11, 30).toISOString(), ends_at: at(day, 14).toISOString() },
      ],
      day,
    );
    expect(c.slice(8, 15)).toEqual([0, 1, 1, 2, 1, 1, 0]);
  });

  it("devolve zero em tudo sem turnos", () => {
    expect(coverageFromShifts([], "2026-10-28").every((n) => n === 0)).toBe(true);
  });
});
