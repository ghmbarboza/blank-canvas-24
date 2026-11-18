import { describe, expect, it } from "vitest";

import { buildAttention, type AttentionSources } from "./attention";

const NOW = new Date("2026-10-27T12:00:00Z").getTime();
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

const empty: AttentionSources = { waiting: [], handoffs: [], risk: [], tickets: [] };

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

const risk = (id: string, score: number) => ({
  contact_id: id,
  name: `Cliente ${id}`,
  score,
  reason: "Sem contato há 70 dias",
  next_action: "Retomar o contato com uma conversa de acompanhamento",
});

describe("buildAttention", () => {
  it("põe chamado atrasado antes de cliente esperando, e cliente em risco por último", () => {
    const r = buildAttention(
      {
        waiting: [{ id: "c1", name: "Ana", unread: 2, last_inbound_at: iso(30) }],
        handoffs: [{ id: "c2", name: "Bia", reason: null, at: iso(10) }],
        risk: [risk("k1", 40)],
        tickets: [ticket("t1", -30)],
      },
      NOW,
    );
    expect(r.map((i) => i.kind)).toEqual(["ticket_late", "waiting", "handoff", "client_risk"]);
    expect(r.at(-1)?.title).toBe("Cliente em risco: Cliente k1");
    expect(r.at(-1)?.reason).toContain("Saúde 40 de 100. Sem contato há 70 dias.");
  });

  it("ignora chamado com folga no prazo", () => {
    expect(buildAttention({ ...empty, tickets: [ticket("t1", 60 * 24)] }, NOW)).toEqual([]);
  });

  it("limita a cinco e, no mesmo tipo, o mais antigo vem primeiro", () => {
    const waiting = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      unread: 1,
      last_inbound_at: iso(i * 10),
    }));
    const r = buildAttention({ ...empty, waiting }, NOW);
    expect(r).toHaveLength(5);
    expect(r[0]?.ref).toBe("c6");
  });

  it("mostra só os dois clientes de pior saúde, o pior primeiro", () => {
    const r = buildAttention(
      { ...empty, risk: [risk("a", 55), risk("b", 20), risk("c", 35)] },
      NOW,
    );
    expect(r.map((i) => i.ref)).toEqual(["b", "c"]);
  });
});
