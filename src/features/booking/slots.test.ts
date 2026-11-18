import { describe, expect, it } from "vitest";

import { computeSlots, pickRoundRobin, zonedToUtc } from "./slots";

const TZ = "America/Sao_Paulo";
// quinta-feira 22/10/2026 08:00 em São Paulo (UTC-3) = 11:00Z
const NOW = Date.UTC(2026, 9, 22, 11, 0);
const base = {
  timeZone: TZ,
  now: NOW,
  availability: {
    "4": [{ start: "09:00", end: "12:00" }],
    "5": [{ start: "14:00", end: "15:00" }],
  },
  durationMin: 30,
  bufferMin: 0,
  stepMin: 30,
  minNoticeMin: 0,
  windowDays: 1,
  busy: [],
};

describe("horários livres", () => {
  it("converte hora de parede do fuso para UTC", () => {
    expect(new Date(zonedToUtc(2026, 10, 22, 9, 0, TZ)).toISOString()).toBe(
      "2026-10-22T12:00:00.000Z",
    );
  });
  it("gera os horários do dia dentro do expediente", () => {
    const s = computeSlots(base);
    expect(s.filter((x) => x.date === "2026-10-22").map((x) => x.label)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
    expect(s.filter((x) => x.date === "2026-10-23").map((x) => x.label)).toEqual([
      "14:00",
      "14:30",
    ]);
  });
  it("respeita antecedência mínima", () => {
    const s = computeSlots({ ...base, minNoticeMin: 120 });
    expect(s.filter((x) => x.date === "2026-10-22")[0]?.label).toBe("10:00");
  });
  it("tira o que choca com compromisso e com o intervalo entre reuniões", () => {
    // 10:00–10:30 local
    const busy = [{ start: Date.UTC(2026, 9, 22, 13, 0), end: Date.UTC(2026, 9, 22, 13, 30) }];
    const s = computeSlots({ ...base, busy, bufferMin: 15 })
      .filter((x) => x.date === "2026-10-22")
      .map((x) => x.label);
    expect(s).toEqual(["09:00", "11:00", "11:30"]);
  });
  it("rodízio escolhe a menor carga proporcional ao peso", () => {
    expect(
      pickRoundRobin(
        [
          { user_id: "a", weight: 1 },
          { user_id: "b", weight: 2 },
        ],
        { a: 1, b: 1 },
      ),
    ).toBe("b");
    expect(pickRoundRobin([], {})).toBeNull();
  });
});
