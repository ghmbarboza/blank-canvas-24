import { describe, expect, it } from "vitest";

import type { TrendRow } from "./api";
import { byGroup, byWeek, delta, formatDuration, totals } from "./kpis";

const row = (
  week: string,
  key: string,
  calls: number,
  tma: number,
  extra: Partial<TrendRow> = {},
): TrendRow => ({
  week,
  group_key: key,
  group_label: key.toUpperCase(),
  voice: {
    inbound: calls,
    answered: calls,
    abandoned: 0,
    tme_seconds: 10,
    tma_seconds: tma,
    fcr_ok: calls,
    fcr_base: calls,
  },
  tickets: null,
  nps: null,
  ...extra,
});

describe("indicadores do gestor", () => {
  it("TMA é ponderado pelo volume, não média de médias", () => {
    const k = totals([row("2026-10-19", "a", 90, 100), row("2026-10-19", "b", 10, 1000)]);
    expect(k.tmaSeconds).toBe(190);
    expect(k.calls).toBe(100);
  });

  it("abandono, FCR, CSAT e NPS", () => {
    const k = totals([
      {
        week: "2026-10-19",
        group_key: "a",
        group_label: "A",
        voice: {
          inbound: 100,
          answered: 90,
          abandoned: 10,
          tme_seconds: 30,
          tma_seconds: 200,
          fcr_ok: 60,
          fcr_base: 80,
        },
        tickets: {
          created: 20,
          resolved: 20,
          frt_seconds: 600,
          resolution_seconds: 3600,
          fcr_ok: 18,
          csat_avg: 4.5,
          csat_n: 10,
        },
        nps: null,
      },
      {
        week: "2026-10-19",
        group_key: "geral",
        group_label: "Geral",
        voice: null,
        tickets: null,
        nps: { n: 10, promoters: 6, detractors: 2 },
      },
    ]);
    expect(k.abandonPct).toBe(10);
    expect(k.fcrPct).toBe(78); // (60 + 18) / (80 + 20)
    expect(k.csat).toBe(4.5);
    expect(k.nps).toBe(40);
    expect(k.ticketFrtSeconds).toBe(600);
  });

  it("semanas em ordem e grupo sem a linha geral do NPS", () => {
    const rows = [
      row("2026-10-19", "a", 5, 60),
      row("2026-10-12", "a", 5, 60),
      {
        ...row("2026-10-19", "geral", 0, 0),
        voice: null,
        nps: { n: 1, promoters: 1, detractors: 0 },
      },
    ];
    expect(byWeek(rows).map((w) => w.week)).toEqual(["2026-10-12", "2026-10-19"]);
    expect(byGroup(rows).map((g) => g.key)).toEqual(["a"]);
  });

  it("variação e duração legível", () => {
    expect(delta([10, null, 12.5])).toBe(2.5);
    expect(delta([10])).toBeNull();
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(185)).toBe("3 min 05 s");
    expect(formatDuration(5400)).toBe("1 h 30");
    expect(formatDuration(null)).toBe("—");
  });
});
