import { describe, expect, it } from "vitest";

import { myTrainingStats, scoreByPersona, type SessionLike } from "./lobby";

const NOW = new Date("2026-10-27T12:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const s = (p: Partial<SessionLike>): SessionLike => ({
  user_id: "eu",
  persona_id: "p1",
  status: "finished",
  score: 80,
  created_at: daysAgo(1),
  ...p,
});

describe("myTrainingStats", () => {
  it("separa o mês atual do anterior e ignora treino aberto e de outra pessoa", () => {
    const r = myTrainingStats(
      [
        s({ score: 90 }),
        s({ score: 70, created_at: daysAgo(10) }),
        s({ score: 50, created_at: daysAgo(40) }),
        s({ score: null, status: "active" }),
        s({ score: 10, user_id: "outro" }),
      ],
      "eu",
      30,
      NOW,
    );
    expect(r).toEqual({ avg: 80, previous: 50, count: 2 });
  });

  it("sem treino encerrado não há média", () => {
    expect(myTrainingStats([], "eu", 30, NOW)).toEqual({ avg: null, previous: null, count: 0 });
  });
});

describe("scoreByPersona", () => {
  it("agrupa a média por persona", () => {
    const m = scoreByPersona(
      [s({ score: 60 }), s({ score: 80 }), s({ persona_id: "p2", score: 90 })],
      "eu",
    );
    expect(m.get("p1")).toEqual({ avg: 70, n: 2 });
    expect(m.get("p2")).toEqual({ avg: 90, n: 1 });
  });
});
