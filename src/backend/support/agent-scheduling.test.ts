import { describe, expect, it } from "vitest";

import { offerSlots, resolveSlotChoice, schedulingPrompt, type FreeSlot } from "./agent-scheduling";

function slot(date: string, label: string): FreeSlot {
  return { start: `${date}T${label}:00.000Z`, date, label };
}

const SLOTS: FreeSlot[] = [
  slot("2026-10-22", "09:00"),
  slot("2026-10-22", "09:30"),
  slot("2026-10-22", "10:00"),
  slot("2026-10-22", "14:00"),
  slot("2026-10-23", "15:00"),
  slot("2026-10-23", "16:00"),
  slot("2026-10-24", "09:00"),
  slot("2026-10-27", "11:00"),
];

describe("oferta de horários para a IA", () => {
  it("espalha: manhã e tarde por dia, com teto", () => {
    const o = offerSlots(SLOTS, 5);
    expect(o.map((x) => x.code)).toEqual(["H1", "H2", "H3", "H4", "H5"]);
    expect(o.map((x) => x.start.slice(0, 16))).toEqual([
      "2026-10-22T09:00",
      "2026-10-22T14:00",
      "2026-10-23T15:00",
      "2026-10-23T16:00",
      "2026-10-24T09:00",
    ]);
    expect(o[0]!.human).toBe("quinta-feira, 22/10 às 09:00");
  });

  it("sem horários livres, nada é oferecido e o prompt manda passar para a equipe", () => {
    expect(offerSlots([])).toEqual([]);
    expect(schedulingPrompt([])).toContain("action=handoff");
  });

  it("aceita só código oferecido", () => {
    const o = offerSlots(SLOTS, 3);
    expect(resolveSlotChoice("h2", o)?.start).toBe(o[1]!.start);
    expect(resolveSlotChoice(" H3 ", o)?.code).toBe("H3");
    expect(resolveSlotChoice("H9", o)).toBeNull();
    expect(resolveSlotChoice("2026-10-22T09:00:00.000Z", o)).toBeNull();
    expect(resolveSlotChoice(undefined, o)).toBeNull();
  });

  it("o prompt lista os códigos", () => {
    const p = schedulingPrompt(offerSlots(SLOTS, 2));
    expect(p).toContain("H1: quinta-feira, 22/10 às 09:00");
    expect(p).toContain("book_slot");
  });
});
