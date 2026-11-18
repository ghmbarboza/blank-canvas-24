// Retenção de gravações e transcrições: o que já venceu segundo o prazo da conta.
// Lógica pura, usada pelo job diário (src/backend/jobs/handlers/privacy.server.ts).

export const DEFAULT_RETENTION = { recordingsDays: 180, transcriptsDays: 365 } as const;
/** Prazo mínimo aceito: um valor corrompido (0, negativo) nunca apaga tudo de uma vez. */
export const MIN_RETENTION_DAYS = 7;
const DAY_MS = 86_400_000;

export interface RetentionCutoffs {
  /** Gravações de antes disto venceram. */
  recordingsBefore: Date;
  /** Transcrições de antes disto venceram. */
  transcriptsBefore: Date;
  recordingsDays: number;
  transcriptsDays: number;
}

function sanitizeDays(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(MIN_RETENTION_DAYS, Math.floor(n));
}

/** Lê o prazo de settings.privacy (o que a aba Privacidade salva) e devolve as datas de corte. */
export function retentionCutoffs(now: Date, privacy: unknown): RetentionCutoffs {
  const p = (privacy && typeof privacy === "object" ? privacy : {}) as Record<string, unknown>;
  const recordingsDays = sanitizeDays(
    p["retention_recordings_days"],
    DEFAULT_RETENTION.recordingsDays,
  );
  const transcriptsDays = sanitizeDays(
    p["retention_transcripts_days"],
    DEFAULT_RETENTION.transcriptsDays,
  );
  return {
    recordingsBefore: new Date(now.getTime() - recordingsDays * DAY_MS),
    transcriptsBefore: new Date(now.getTime() - transcriptsDays * DAY_MS),
    recordingsDays,
    transcriptsDays,
  };
}

/** Venceu se a data existe, é válida e é anterior ao corte. Sem data não apaga (na dúvida, guarda). */
export function isExpired(at: string | Date | null | undefined, cutoff: Date): boolean {
  if (!at) return false;
  const t = (at instanceof Date ? at : new Date(at)).getTime();
  return Number.isFinite(t) && t < cutoff.getTime();
}

/** Data de referência da reunião: fim, senão início, senão o agendado. */
export function meetingReferenceDate(m: {
  ended_at?: string | null;
  started_at?: string | null;
  scheduled_start?: string | null;
}): string | null {
  return m.ended_at ?? m.started_at ?? m.scheduled_start ?? null;
}

/** Caminhos do bucket call-recordings que podem ser removidos (só os da própria conta). */
export function ownedRecordingPaths(accountId: string, paths: (string | null)[]): string[] {
  const prefix = `${accountId}/`;
  return paths.filter(
    (p): p is string => typeof p === "string" && p.startsWith(prefix) && !p.includes(".."),
  );
}

/** Roda no máximo uma vez a cada 20 h por conta. */
export function shouldRunRetention(lastRunAt: string | null | undefined, now: Date): boolean {
  if (!lastRunAt) return true;
  const t = new Date(lastRunAt).getTime();
  return !Number.isFinite(t) || now.getTime() - t >= 20 * 3_600_000;
}
