import { describe, expect, it } from "vitest";

import {
  criterionWord,
  groupMeetings,
  meetingDurationMin,
  meetingScore,
  type MeetingLike,
} from "./lib";

function m(over: Partial<MeetingLike> & { id: string }): MeetingLike {
  return {
    status: "ended",
    title: over.id,
    scheduled_start: null,
    scheduled_end: null,
    started_at: null,
    ended_at: null,
    created_at: "2026-10-01T12:00:00Z",
    score: null,
    ...over,
  };
}

const NOW = new Date("2026-10-27T15:00:00");

describe("groupMeetings", () => {
  it("põe ao vivo primeiro, depois as próximas em ordem e o passado por dia", () => {
    const groups = groupMeetings(
      [
        m({ id: "velha", started_at: "2026-10-01T10:00:00" }),
        m({ id: "ontem", started_at: "2026-10-26T14:30:00" }),
        m({ id: "depois", status: "scheduled", scheduled_start: "2026-10-29T10:00:00" }),
        m({ id: "logo", status: "scheduled", scheduled_start: "2026-10-27T16:00:00" }),
        m({ id: "agora", status: "live", started_at: "2026-10-27T14:50:00" }),
        m({ id: "semana-passada", started_at: "2026-10-18T09:00:00" }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Agora",
      "Próximas",
      "Ontem",
      "Semana passada",
      "Mais antigas",
    ]);
    expect(groups[1]?.items.map((x) => x.id)).toEqual(["logo", "depois"]);
  });

  it("devolve lista vazia sem reuniões", () => {
    expect(groupMeetings([], NOW)).toEqual([]);
  });
});

describe("meetingScore e duração", () => {
  it("lê a nota total e ignora o que não é número", () => {
    expect(meetingScore({ score: { total: 87.6 } })).toBe(88);
    expect(meetingScore({ score: { total: "x" } })).toBeNull();
    expect(meetingScore({ score: null })).toBeNull();
  });

  it("usa a duração real quando a reunião aconteceu", () => {
    expect(
      meetingDurationMin(
        m({ id: "a", started_at: "2026-10-26T14:30:00Z", ended_at: "2026-10-26T15:15:00Z" }),
      ),
    ).toBe(45);
    expect(
      meetingDurationMin(
        m({
          id: "b",
          scheduled_start: "2026-10-26T14:00:00Z",
          scheduled_end: "2026-10-26T14:30:00Z",
        }),
      ),
    ).toBe(30);
    expect(meetingDurationMin(m({ id: "c", started_at: "2026-10-26T14:30:00Z" }))).toBeNull();
  });

  it("traduz a nota do critério em palavra", () => {
    expect(criterionWord(9)).toBe("Excelente");
    expect(criterionWord(7)).toBe("Bom");
    expect(criterionWord(5)).toBe("Regular");
    expect(criterionWord(2)).toBe("Fraco");
  });
});
