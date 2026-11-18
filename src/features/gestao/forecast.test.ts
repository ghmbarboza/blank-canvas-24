import { describe, expect, it } from "vitest";

import {
  addDays,
  ahtFor,
  explainHour,
  forecastDay,
  staffingPlan,
  summarize,
  weekday,
  type HistoryRow,
} from "./forecast";

const TARGET = "2026-10-27"; // terça

function weeksOf(channel: string, hour: number, values: number[], handle: number | null = null) {
  // values[0] = semana mais recente
  return values.map<HistoryRow>((v, i) => ({
    channel,
    day: addDays(TARGET, -7 * (i + 1)),
    hour,
    arrivals: v,
    handle_seconds: handle,
  }));
}

describe("previsão sazonal", () => {
  it("datas e dia da semana sem fuso", () => {
    expect(addDays("2026-10-27", -7)).toBe("2026-10-20");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekday("2026-10-27")).toBe(2);
  });

  it("média ponderada: semana recente pesa mais", () => {
    const rows = weeksOf("voice", 10, [20, 10]); // pesos 2 e 1
    const [f] = forecastDay(rows, TARGET, 8);
    expect(f?.weeksUsed).toBe(2);
    expect(f?.hours[10]?.expected).toBeCloseTo((20 * 2 + 10 * 1) / 3, 1);
    expect(f?.hours[10]?.samples).toEqual([20, 10]);
  });

  it("semana sem registro conta como zero, mas antes do primeiro registro não conta", () => {
    const rows = [
      ...weeksOf("whatsapp", 9, [12]),
      {
        channel: "whatsapp",
        day: addDays(TARGET, -21),
        hour: 9,
        arrivals: 12,
        handle_seconds: null,
      },
    ];
    const [f] = forecastDay(rows, TARGET, 8);
    // semanas usadas: -7 (12), -14 (0), -21 (12); antes de -21 não havia canal
    expect(f?.weeksUsed).toBe(3);
    expect(f?.hours[9]?.samples).toEqual([12, 0, 12]);
  });

  it("ignora o próprio dia e dias futuros", () => {
    const rows: HistoryRow[] = [
      { channel: "voice", day: TARGET, hour: 9, arrivals: 999, handle_seconds: null },
      ...weeksOf("voice", 9, [5]),
    ];
    expect(forecastDay(rows, TARGET)[0]?.hours[9]?.expected).toBe(5);
  });

  it("sem histórico, sem previsão", () => {
    expect(forecastDay([], TARGET)).toEqual([]);
  });

  it("explica a conta em português", () => {
    const [f] = forecastDay(weeksOf("voice", 14, [8, 6]), TARGET);
    expect(explainHour(f!, 14)).toContain("Ligações às 14h");
    expect(explainHour(f!, 14)).toContain("(8, 6)");
  });

  it("TMA: configurado vence o histórico, que vence o padrão", () => {
    const rows = weeksOf("voice", 10, [10, 10], 300);
    expect(ahtFor("voice", { voice: 200 }, rows)).toEqual({ seconds: 200, source: "configurado" });
    expect(ahtFor("voice", {}, rows)).toEqual({ seconds: 300, source: "histórico" });
    expect(ahtFor("whatsapp", {}, rows).source).toBe("padrão");
  });

  it("monta a necessidade por hora e o resumo do dia", () => {
    const rows = weeksOf("voice", 10, [200, 200], 180);
    const plan = staffingPlan(forecastDay(rows, TARGET), rows, {
      serviceLevel: 0.8,
      answerSeconds: 20,
      shrinkage: 0,
      chatConcurrency: 3,
      aht: {},
    });
    expect(plan[10]?.agents).toBe(14); // 200/h × 180 s = 10 erlangs → 14
    expect(plan[9]?.agents).toBe(0);
    const s = summarize(plan);
    expect(s.peakHour).toBe(10);
    expect(s.peakPeople).toBe(14);
    expect(s.firstHour).toBe(10);
    expect(s.lastHour).toBe(10);
  });
});
