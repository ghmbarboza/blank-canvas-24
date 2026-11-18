import { describe, expect, it } from "vitest";

import {
  SHIFT_TEMPLATES,
  computeAdherence,
  coverageOf,
  suggestShifts,
  toShiftWindow,
  workingWindows,
} from "./schedule";

const H = 3_600_000;

describe("montagem de escala", () => {
  it("cobre toda hora que precisa de gente", () => {
    const need = new Array<number>(24).fill(0);
    for (let h = 8; h < 18; h += 1) need[h] = 3;
    need[12] = 5;
    const shifts = suggestShifts(need, SHIFT_TEMPLATES[0]!);
    const cov = coverageOf(shifts);
    for (let h = 0; h < 24; h += 1) expect(cov[h]).toBeGreaterThanOrEqual(need[h]!);
    expect(shifts.every((s) => s.endHour - s.startHour === 9)).toBe(true);
  });

  it("turno no fim do dia não passa da meia-noite", () => {
    const need = new Array<number>(24).fill(0);
    need[23] = 1;
    const [s] = suggestShifts(need, SHIFT_TEMPLATES[1]!);
    expect(s?.endHour).toBe(24);
    expect(s?.startHour).toBe(18);
  });

  it("sem necessidade, sem turno", () => {
    expect(suggestShifts(new Array<number>(24).fill(0), SHIFT_TEMPLATES[0]!)).toEqual([]);
  });
});

describe("aderência", () => {
  const base = Date.UTC(2026, 9, 27, 11, 0); // 08:00 em São Paulo
  const shift = {
    userId: "u1",
    start: base,
    end: base + 9 * H,
    breaks: [{ start: base + 4 * H, end: base + 5 * H }],
  };

  it("tira a pausa das janelas de trabalho", () => {
    expect(workingWindows(shift)).toEqual([
      { start: base, end: base + 4 * H },
      { start: base + 5 * H, end: base + 9 * H },
    ]);
  });

  it("100% quando esteve disponível em todo o horário de trabalho", () => {
    const [a] = computeAdherence(
      [shift],
      [{ userId: "u1", status: "available", start: base - H, end: base + 10 * H }],
      base + 12 * H,
    );
    expect(a?.scheduledMinutes).toBe(480);
    expect(a?.adherence).toBe(1);
    expect(a?.outOfShiftMinutes).toBe(180); // 1 h antes + 1 h de pausa + 1 h depois
  });

  it("chegou 1 h atrasado: 7 de 8 horas", () => {
    const [a] = computeAdherence(
      [shift],
      [
        { userId: "u1", status: "offline", start: base, end: base + H },
        { userId: "u1", status: "busy", start: base + H, end: base + 9 * H },
      ],
      base + 12 * H,
    );
    expect(a?.inAdherenceMinutes).toBe(420);
    expect(a?.adherence).toBeCloseTo(0.875, 3);
  });

  it("turno em andamento conta só até agora", () => {
    const [a] = computeAdherence(
      [shift],
      [{ userId: "u1", status: "available", start: base, end: null }],
      base + 2 * H,
    );
    expect(a?.scheduledMinutes).toBe(120);
    expect(a?.adherence).toBe(1);
  });

  it("lê o turno do banco e ignora pausa malformada", () => {
    const w = toShiftWindow({
      user_id: "u1",
      starts_at: "2026-10-27T11:00:00Z",
      ends_at: "2026-10-27T20:00:00Z",
      breaks: [{ start: "2026-10-27T15:00:00Z", end: "2026-10-27T16:00:00Z" }, { start: "x" }, 3],
    });
    expect(w.breaks).toHaveLength(1);
  });
});
