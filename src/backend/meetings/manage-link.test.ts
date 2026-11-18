import { describe, expect, it } from "vitest";

import {
  MANAGE_TOKEN_RE,
  guestActions,
  manageExpiry,
  signManageToken,
  verifyManageToken,
} from "./manage-link";

const ID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const EXP = Date.UTC(2026, 11, 1);

describe("link de gerenciar reunião", () => {
  it("assina e confere ida e volta", () => {
    const t = signManageToken({ meetingId: ID, exp: EXP }, "s3gredo");
    expect(MANAGE_TOKEN_RE.test(t)).toBe(true);
    expect(t.length).toBeLessThan(70);
    expect(verifyManageToken(t, "s3gredo", EXP - 1000)).toEqual({ meetingId: ID, exp: EXP });
  });

  it("recusa segredo errado, adulteração, validade vencida e lixo", () => {
    const t = signManageToken({ meetingId: ID, exp: EXP }, "s3gredo");
    expect(verifyManageToken(t, "outro", EXP - 1000)).toBeNull();
    const forged = `${"a".repeat(32)}${t.slice(32)}`;
    expect(verifyManageToken(forged, "s3gredo", EXP - 1000)).toBeNull();
    expect(verifyManageToken(t, "s3gredo", EXP + 1000)).toBeNull();
    expect(verifyManageToken("lixo", "s3gredo")).toBeNull();
  });

  it("validade é 30 dias depois do fim", () => {
    const now = Date.UTC(2026, 9, 1);
    expect(manageExpiry("2026-10-10T12:00:00Z", now)).toBe(
      Date.parse("2026-10-10T12:00:00Z") + 30 * 86_400_000,
    );
    expect(manageExpiry(null, now)).toBe(now + 30 * 86_400_000);
  });
});

describe("ações do convidado", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  it("reunião futura: confirma, cancela e remarca", () => {
    expect(
      guestActions({ status: "scheduled", scheduled_start: "2026-10-22T12:00:00Z" }, now),
    ).toEqual({ canConfirm: true, canCancel: true, canReschedule: true });
  });
  it("não compareceu: só remarca", () => {
    expect(
      guestActions({ status: "no_show", scheduled_start: "2026-10-20T12:00:00Z" }, now),
    ).toEqual({ canConfirm: false, canCancel: false, canReschedule: true });
  });
  it("cancelada, encerrada ou já passada: nada", () => {
    for (const status of ["canceled", "ended", "live"])
      expect(
        Object.values(guestActions({ status, scheduled_start: "2026-10-22T12:00:00Z" }, now)),
      ).toEqual([false, false, false]);
    expect(
      guestActions({ status: "scheduled", scheduled_start: "2026-10-20T12:00:00Z" }, now).canCancel,
    ).toBe(false);
  });
  it("limite de remarcações", () => {
    expect(
      guestActions(
        { status: "scheduled", scheduled_start: "2026-10-22T12:00:00Z", reschedule_count: 3 },
        now,
      ).canReschedule,
    ).toBe(false);
  });
});
