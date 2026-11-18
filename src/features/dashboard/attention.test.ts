import { describe, expect, it } from "vitest";

import { buildAttention, type AttentionSources } from "./attention";

const NOW = new Date("2026-10-27T12:00:00Z").getTime();
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const empty: AttentionSources = { hot: [], handoffs: [], deals: [], tickets: [] };

function ticket(id: string, dueInMin: number) {
  return {
    id,
    number: 10,
    subject: "Troca",
    status: "open",
    created_at: iso(600),
    first_response_at: iso(500),
    first_response_due_at: null,
    resolution_due_at: new Date(NOW + dueInMin * 60_000).toISOString(),
  };
}

describe("buildAttention", () => {
  it("põe chamado atrasado antes de lead quente, e negócio parado por último", () => {
    const r = buildAttention(
      {
        hot: [{ id: "c1", name: "Ana", unread: 2, last_inbound_at: iso(30) }],
        handoffs: [{ id: "c2", name: "Bia", reason: null, at: iso(10) }],
        deals: [
          { id: "d1", title: "Plano anual", value: 5000, contact: null, updated_at: iso(20000) },
        ],
        tickets: [ticket("t1", -30)],
      },
      NOW,
    );
    expect(r.map((i) => i.kind)).toEqual(["ticket_late", "hot_waiting", "handoff", "deal_stalled"]);
  });

  it("ignora chamado com folga no prazo", () => {
    expect(buildAttention({ ...empty, tickets: [ticket("t1", 60 * 24)] }, NOW)).toEqual([]);
  });

  it("limita a cinco e, no mesmo tipo, o mais antigo vem primeiro", () => {
    const hot = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      unread: 1,
      last_inbound_at: iso(i * 10),
    }));
    const r = buildAttention({ ...empty, hot }, NOW);
    expect(r).toHaveLength(5);
    expect(r[0]?.ref).toBe("c6");
  });
});
