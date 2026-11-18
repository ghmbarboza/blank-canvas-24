import { describe, expect, it } from "vitest";

import {
  MIN_RETENTION_DAYS,
  isExpired,
  meetingReferenceDate,
  ownedRecordingPaths,
  retentionCutoffs,
  shouldRunRetention,
} from "./retention";

const NOW = new Date("2026-10-21T12:00:00Z");

describe("datas de corte da retenção", () => {
  it("usa o prazo salvo na aba Privacidade", () => {
    const c = retentionCutoffs(NOW, {
      retention_recordings_days: 30,
      retention_transcripts_days: 90,
    });
    expect(c.recordingsBefore.toISOString()).toBe("2026-09-21T12:00:00.000Z");
    expect(c.transcriptsBefore.toISOString()).toBe("2026-07-23T12:00:00.000Z");
  });
  it("sem configuração usa 180 e 365 dias", () => {
    const c = retentionCutoffs(NOW, undefined);
    expect(c.recordingsDays).toBe(180);
    expect(c.transcriptsDays).toBe(365);
  });
  it("valor quebrado nunca apaga tudo", () => {
    const c = retentionCutoffs(NOW, {
      retention_recordings_days: 0,
      retention_transcripts_days: "abc",
    });
    expect(c.recordingsDays).toBe(MIN_RETENTION_DAYS);
    expect(c.transcriptsDays).toBe(365);
    expect(retentionCutoffs(NOW, { retention_recordings_days: -5 }).recordingsDays).toBe(
      MIN_RETENTION_DAYS,
    );
  });
});

describe("o que venceu", () => {
  const cutoff = new Date("2026-09-01T00:00:00Z");
  it("anterior ao corte venceu, depois não", () => {
    expect(isExpired("2026-08-31T23:59:59Z", cutoff)).toBe(true);
    expect(isExpired("2026-09-01T00:00:00Z", cutoff)).toBe(false);
    expect(isExpired(new Date("2026-10-01"), cutoff)).toBe(false);
  });
  it("sem data ou data inválida não apaga", () => {
    expect(isExpired(null, cutoff)).toBe(false);
    expect(isExpired(undefined, cutoff)).toBe(false);
    expect(isExpired("ontem", cutoff)).toBe(false);
  });
  it("reunião usa o fim, depois o início, depois o agendado", () => {
    expect(meetingReferenceDate({ ended_at: "a", started_at: "b", scheduled_start: "c" })).toBe(
      "a",
    );
    expect(meetingReferenceDate({ started_at: "b", scheduled_start: "c" })).toBe("b");
    expect(meetingReferenceDate({ scheduled_start: "c" })).toBe("c");
    expect(meetingReferenceDate({})).toBeNull();
  });
  it("só remove arquivos da própria conta", () => {
    expect(
      ownedRecordingPaths("acc", ["acc/1.mp3", "outra/2.mp3", null, "acc/../outra/3.mp3"]),
    ).toEqual(["acc/1.mp3"]);
  });
  it("roda no máximo uma vez a cada 20 h", () => {
    expect(shouldRunRetention(null, NOW)).toBe(true);
    expect(shouldRunRetention("2026-10-21T00:00:00Z", NOW)).toBe(false);
    expect(shouldRunRetention("2026-10-20T15:00:00Z", NOW)).toBe(true);
    expect(shouldRunRetention("lixo", NOW)).toBe(true);
  });
});
