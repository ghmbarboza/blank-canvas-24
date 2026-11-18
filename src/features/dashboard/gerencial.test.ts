import { describe, expect, it } from "vitest";

import { demoGerencial } from "./demo";
import { deltaPct, formatDuration, isEmptyAccount } from "./gerencial";

describe("painel gerencial", () => {
  it("calcula a variação contra o período anterior e não inventa base", () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    expect(deltaPct(10, 0)).toBeNull();
    expect(deltaPct(null, 100)).toBeNull();
  });

  it("formata o tempo de resposta em pt-BR", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(252)).toBe("4 min 12 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(3900)).toBe("1 h 5 min");
  });

  it("o exemplo é determinístico e cobre o período inteiro", () => {
    const a = demoGerencial(30);
    expect(a.daily).toHaveLength(30);
    // "mais antiga aguardando" é relativa ao relógio de propósito; o resto é fixo.
    const b = demoGerencial(30);
    expect({ ...b.kpis, oldest_waiting_at: null }).toEqual({ ...a.kpis, oldest_waiting_at: null });
    expect(b.daily).toEqual(a.daily);
    expect(isEmptyAccount(a)).toBe(false);
  });

  it("conta sem movimento é reconhecida como vazia", () => {
    const empty = demoGerencial(7);
    const zero = {
      ...empty,
      kpis: {
        ...empty.kpis,
        messages_in: 0,
        messages_out: 0,
        pipeline_count: 0,
        won_count: 0,
        new_leads: 0,
      },
      temperature: { hot: 0, warm: 0, cold: 0, unclassified: 0 },
    };
    expect(isEmptyAccount(zero)).toBe(true);
    expect(isEmptyAccount(undefined)).toBe(false);
  });
});
