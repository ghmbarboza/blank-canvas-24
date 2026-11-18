import { describe, expect, it } from "vitest";

import { dealHealth, type HealthSignals } from "./health";

const NOW = new Date("2026-10-21T12:00:00Z").getTime();
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const base: HealthSignals = {
  status: "open",
  lastTouchAt: ago(1),
  nextActivityAt: ago(-2),
  overdueActivities: 0,
  proposal: null,
  risks: [],
  temperature: null,
  expectedCloseDate: null,
};

describe("dealHealth", () => {
  it("negócio fechado não tem nota", () => {
    expect(dealHealth({ ...base, status: "won" }, NOW)).toEqual({
      score: null,
      level: "closed",
      reasons: [],
    });
  });

  it("contato recente e próximo passo agendado fica saudável", () => {
    const h = dealHealth(base, NOW);
    expect(h.score).toBe(100);
    expect(h.level).toBe("good");
  });

  it("muitos dias sem contato e sem próximo passo derruba para risco", () => {
    const h = dealHealth({ ...base, lastTouchAt: ago(20), nextActivityAt: null }, NOW);
    expect(h.score).toBe(50);
    expect(h.level).toBe("attention");
    const worse = dealHealth(
      {
        ...base,
        lastTouchAt: ago(20),
        nextActivityAt: null,
        risks: ["a", "b"],
        temperature: "cold",
      },
      NOW,
    );
    expect(worse.score).toBe(24);
    expect(worse.level).toBe("risk");
    expect(worse.reasons.map((r) => r.text)).toContain("20 dias sem contato");
  });

  it("riscos tiram no máximo 24 pontos e tarefas atrasadas no máximo 15", () => {
    const h = dealHealth({ ...base, risks: ["a", "b", "c", "d", "e"], overdueActivities: 9 }, NOW);
    expect(h.score).toBe(100 - 24 - 15);
  });

  it("proposta vista ajuda; enviada e não aberta há mais de 3 dias atrapalha", () => {
    const viewed = dealHealth(
      {
        ...base,
        lastTouchAt: ago(10),
        proposal: { status: "viewed", sent_at: ago(5), first_viewed_at: ago(4), view_count: 3 },
      },
      NOW,
    );
    expect(viewed.score).toBe(90);
    expect(viewed.reasons.some((r) => r.text === "Proposta vista 3 vezes")).toBe(true);
    const unopened = dealHealth(
      {
        ...base,
        proposal: { status: "sent", sent_at: ago(5), first_viewed_at: null, view_count: 0 },
      },
      NOW,
    );
    expect(unopened.score).toBe(90);
  });

  it("previsão vencida e interesse alto entram na conta, limitado a 0..100", () => {
    const h = dealHealth({ ...base, temperature: "hot", expectedCloseDate: "2026-10-01" }, NOW);
    expect(h.score).toBe(100);
    const none = dealHealth(
      {
        ...base,
        lastTouchAt: null,
        nextActivityAt: null,
        overdueActivities: 5,
        risks: ["a", "b", "c"],
        temperature: "cold",
        expectedCloseDate: "2026-01-01",
        proposal: { status: "declined", sent_at: null, first_viewed_at: null, view_count: 0 },
      },
      NOW,
    );
    expect(none.score).toBe(0);
  });
});
