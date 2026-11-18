import { describe, expect, it } from "vitest";

import {
  applyAction,
  matchChanges,
  meetingSyncHash,
  normalizeGoogleEvent,
  normalizeGraphEvent,
  parseLinks,
  planChange,
  planPush,
  upsertLink,
  type MeetingSnapshot,
} from "./sync";

const START = "2026-10-25T13:00:00.000Z";
const END = "2026-10-25T13:30:00.000Z";
const meeting = (over: Partial<MeetingSnapshot> = {}): MeetingSnapshot => ({
  id: "m1",
  status: "scheduled",
  scheduled_start: START,
  scheduled_end: END,
  external_events: [],
  ...over,
});

describe("hash e links", () => {
  it("hash muda com horário e cancelamento, não com o formato da data", () => {
    const a = meetingSyncHash(meeting());
    expect(meetingSyncHash(meeting({ scheduled_start: "2026-10-25T13:00:00+00:00" }))).toBe(a);
    expect(meetingSyncHash(meeting({ status: "canceled" }))).not.toBe(a);
    expect(meetingSyncHash(meeting({ scheduled_end: "2026-10-25T14:00:00Z" }))).not.toBe(a);
  });

  it("lê links e descarta lixo", () => {
    expect(
      parseLinks([
        { connection_id: "c1", provider: "microsoft", id: "e1", hash: "h" },
        { connection_id: "c2", id: "" },
        "x",
        null,
      ]),
    ).toEqual([{ connection_id: "c1", provider: "microsoft", id: "e1", hash: "h" }]);
    expect(parseLinks("não é lista")).toEqual([]);
  });

  it("troca o link da mesma conexão e mantém os outros", () => {
    const links = parseLinks([
      { connection_id: "c1", provider: "google", id: "e1", hash: "a" },
      { connection_id: "c2", provider: "microsoft", id: "e2", hash: "a" },
    ]);
    const out = upsertLink(links, { connection_id: "c1", provider: "google", id: "e1", hash: "b" });
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.connection_id === "c1")!.hash).toBe("b");
  });
});

describe("normalização", () => {
  it("Google: cancelado, horário e dia inteiro", () => {
    expect(normalizeGoogleEvent({ id: "g1", status: "cancelled" })).toEqual({
      id: "g1",
      canceled: true,
      start: null,
      end: null,
    });
    expect(
      normalizeGoogleEvent({
        id: "g2",
        status: "confirmed",
        start: { dateTime: "2026-10-25T10:00:00-03:00" },
        end: { dateTime: "2026-10-25T10:30:00-03:00" },
      }),
    ).toEqual({ id: "g2", canceled: false, start: START, end: END });
    expect(normalizeGoogleEvent({ id: "g3", start: { date: "2026-10-25" } })!.start).toBeNull();
    expect(normalizeGoogleEvent({})).toBeNull();
  });

  it("Graph: UTC sem Z, @removed e isCancelled", () => {
    expect(
      normalizeGraphEvent({
        id: "o1",
        start: { dateTime: "2026-10-25T13:00:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-10-25T13:30:00.0000000", timeZone: "UTC" },
      }),
    ).toEqual({ id: "o1", canceled: false, start: START, end: END });
    expect(normalizeGraphEvent({ id: "o2", "@removed": { reason: "deleted" } })!.canceled).toBe(
      true,
    );
    expect(normalizeGraphEvent({ id: "o3", isCancelled: true })!.canceled).toBe(true);
    // fuso que não pedimos: não arrisca converter errado
    expect(
      normalizeGraphEvent({
        id: "o4",
        start: { dateTime: "2026-10-25T10:00:00", timeZone: "E. South America Standard Time" },
        end: { dateTime: "2026-10-25T10:30:00", timeZone: "E. South America Standard Time" },
      })!.start,
    ).toBeNull();
  });
});

describe("planChange (agenda → Nexus)", () => {
  const c = (over = {}) => ({ id: "e1", canceled: false, start: START, end: END, ...over });

  it("cancelado lá cancela aqui", () => {
    expect(planChange(meeting(), c({ canceled: true }))).toEqual({ kind: "cancel" });
  });
  it("movido lá remarca aqui", () => {
    expect(
      planChange(
        meeting(),
        c({ start: "2026-10-26T13:00:00.000Z", end: "2026-10-26T14:00:00.000Z" }),
      ),
    ).toEqual({ kind: "move", start: "2026-10-26T13:00:00.000Z", end: "2026-10-26T14:00:00.000Z" });
  });
  it("mesmo horário (ou diferença de segundos) não faz nada", () => {
    expect(planChange(meeting(), c())).toEqual({ kind: "none" });
    expect(planChange(meeting(), c({ start: "2026-10-25T13:00:20.000Z" }))).toEqual({
      kind: "none",
    });
  });
  it("reunião encerrada, ao vivo ou já cancelada não se mexe", () => {
    for (const status of ["ended", "live", "canceled", "no_show"])
      expect(planChange(meeting({ status }), c({ canceled: true }))).toEqual({ kind: "none" });
  });
  it("sem horário ou com fim antes do início não remarca", () => {
    expect(planChange(meeting(), c({ start: null }))).toEqual({ kind: "none" });
    expect(planChange(meeting(), c({ start: END, end: START }))).toEqual({ kind: "none" });
  });
});

describe("matchChanges", () => {
  const m1 = meeting({
    external_events: [{ connection_id: "c1", provider: "google", id: "e1", hash: "h" }],
  });
  const m2 = meeting({
    id: "m2",
    external_events: [{ connection_id: "c2", provider: "microsoft", id: "e2", hash: "h" }],
  });

  it("só considera eventos nossos daquela conexão e a última mudança de cada um", () => {
    const out = matchChanges(
      [m1, m2],
      [
        { id: "alheio", canceled: true, start: null, end: null },
        { id: "e2", canceled: true, start: null, end: null }, // outra conexão
        {
          id: "e1",
          canceled: false,
          start: "2026-10-26T13:00:00.000Z",
          end: "2026-10-26T13:30:00.000Z",
        },
        { id: "e1", canceled: true, start: null, end: null },
      ],
      "c1",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.meeting.id).toBe("m1");
    expect(out[0]!.action).toEqual({ kind: "cancel" });
  });

  it("applyAction devolve a reunião como fica", () => {
    expect(applyAction(m1, { kind: "cancel" }).status).toBe("canceled");
    expect(applyAction(m1, { kind: "move", start: "a", end: "b" })).toMatchObject({
      scheduled_start: "a",
      scheduled_end: "b",
    });
  });
});

describe("planPush (Nexus → agenda)", () => {
  it("reunião nova sem link: cria em cada agenda conectada", () => {
    expect(planPush(meeting(), ["c1", "c2"])).toEqual([
      { kind: "create", connectionId: "c1" },
      { kind: "create", connectionId: "c2" },
    ]);
  });

  it("agenda já no estado certo: nada a fazer (mudança que veio dela mesma)", () => {
    const m = meeting();
    const hash = meetingSyncHash(m);
    expect(
      planPush(
        { ...m, external_events: [{ connection_id: "c1", provider: "google", id: "e1", hash }] },
        ["c1"],
      ),
    ).toEqual([]);
  });

  it("remarcada no Nexus: atualiza só a agenda desatualizada", () => {
    const m = meeting({
      scheduled_start: "2026-10-26T13:00:00.000Z",
      scheduled_end: "2026-10-26T13:30:00.000Z",
    });
    const ok = meetingSyncHash(m);
    const ops = planPush(
      {
        ...m,
        external_events: [
          { connection_id: "c1", provider: "google", id: "e1", hash: "velho" },
          { connection_id: "c2", provider: "microsoft", id: "e2", hash: ok },
        ],
      },
      ["c1", "c2"],
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "update", connectionId: "c1" });
  });

  it("cancelada: apaga onde existe evento e não cria em agenda nova", () => {
    const ops = planPush(
      meeting({
        status: "canceled",
        external_events: [{ connection_id: "c1", provider: "google", id: "e1", hash: "velho" }],
      }),
      ["c1", "c2"],
    );
    expect(ops).toEqual([
      {
        kind: "delete",
        connectionId: "c1",
        link: { connection_id: "c1", provider: "google", id: "e1", hash: "velho" },
      },
    ]);
  });

  it("encerrada não mexe na agenda", () => {
    expect(planPush(meeting({ status: "ended" }), ["c1"])).toEqual([]);
  });
});
