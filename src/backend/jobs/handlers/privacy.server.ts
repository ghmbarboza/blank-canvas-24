// Retenção automática (LGPD): uma vez por dia por conta, apaga gravações e transcrições vencidas
// segundo o prazo da aba Privacidade e registra o que saiu em audit_log.
//   - ligações: arquivo no bucket call-recordings + calls.recording_path; calls.transcript(_segments)
//   - reuniões: arquivo no bucket meeting-recordings (gravação do worker), meetings.recording_url e meeting_transcripts
import { admin } from "@/backend/http.server";
import {
  isExpired,
  meetingReferenceDate,
  ownedRecordingPaths,
  retentionCutoffs,
  shouldRunRetention,
  type RetentionCutoffs,
} from "@/features/privacy/retention";
import { registerPeriodic } from "../registry.server";

/** Lote por tipo e por conta em cada passada; o que sobrar sai na passada seguinte. */
const BATCH = 200;
const RUN_ACTION = "retention.run";

interface Purged {
  call_recordings: number;
  call_transcripts: number;
  meeting_recordings: number;
  meeting_transcript_lines: number;
  /** true quando algum lote veio cheio: ainda pode haver vencidos, roda de novo no próximo tick. */
  more: boolean;
}

async function purgeCallRecordings(accountId: string, c: RetentionCutoffs) {
  const db = admin();
  const { data, error } = await db
    .from("calls")
    .select("id, recording_path, started_at")
    .eq("account_id", accountId)
    .not("recording_path", "is", null)
    .lt("started_at", c.recordingsBefore.toISOString())
    .limit(BATCH);
  if (error) throw new Error(`calls (gravações): ${error.message}`);
  const rows = (data ?? []).filter((r) => isExpired(r.started_at, c.recordingsBefore));
  if (rows.length === 0) return { count: 0, full: false };
  const paths = ownedRecordingPaths(
    accountId,
    rows.map((r) => r.recording_path),
  );
  if (paths.length > 0) {
    const rm = await db.storage.from("call-recordings").remove(paths);
    if (rm.error) throw new Error(`storage: ${rm.error.message}`);
  }
  const { error: up } = await db
    .from("calls")
    .update({ recording_path: null, recording_status: "expired" })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (up) throw new Error(`calls update: ${up.message}`);
  return { count: rows.length, full: (data ?? []).length === BATCH };
}

async function purgeCallTranscripts(accountId: string, c: RetentionCutoffs) {
  const db = admin();
  const { data, error } = await db
    .from("calls")
    .select("id, started_at")
    .eq("account_id", accountId)
    .or("transcript.not.is.null,transcript_segments.not.is.null")
    .lt("started_at", c.transcriptsBefore.toISOString())
    .limit(BATCH);
  if (error) throw new Error(`calls (transcrições): ${error.message}`);
  const ids = (data ?? [])
    .filter((r) => isExpired(r.started_at, c.transcriptsBefore))
    .map((r) => r.id);
  if (ids.length === 0) return { count: 0, full: false };
  const { error: up } = await db
    .from("calls")
    .update({ transcript: null, transcript_segments: null })
    .in("id", ids);
  if (up) throw new Error(`calls update: ${up.message}`);
  return { count: ids.length, full: (data ?? []).length === BATCH };
}

async function purgeMeetingRecordings(accountId: string, c: RetentionCutoffs) {
  const db = admin();
  // scheduled_start é só o pré-filtro; a data que vale é a do fim da reunião (meetingReferenceDate).
  const { data, error } = await db
    .from("meetings")
    .select("id, ended_at, started_at, scheduled_start, recording_url")
    .eq("account_id", accountId)
    .not("recording_url", "is", null)
    .lt("scheduled_start", c.recordingsBefore.toISOString())
    .limit(BATCH);
  if (error) throw new Error(`meetings: ${error.message}`);
  const expired = (data ?? []).filter((m) =>
    isExpired(meetingReferenceDate(m), c.recordingsBefore),
  );
  const ids = expired.map((m) => m.id);
  if (ids.length === 0) return { count: 0, full: false };
  // gravação feita pelo worker mora no nosso bucket: apaga o arquivo antes de soltar o link
  const files = expired
    .map((m) => /^storage:\/\/meeting-recordings\/(.+)$/.exec(m.recording_url ?? "")?.[1])
    .filter((p): p is string => Boolean(p));
  if (files.length) {
    const { error: rm } = await db.storage.from("meeting-recordings").remove(files);
    if (rm) throw new Error(`meeting-recordings: ${rm.message}`);
  }
  const { error: up } = await db.from("meetings").update({ recording_url: null }).in("id", ids);
  if (up) throw new Error(`meetings update: ${up.message}`);
  return { count: ids.length, full: (data ?? []).length === BATCH };
}

async function purgeMeetingTranscripts(accountId: string, c: RetentionCutoffs) {
  const db = admin();
  const { data, error } = await db
    .from("meeting_transcripts")
    .select("id, created_at")
    .eq("account_id", accountId)
    .lt("created_at", c.transcriptsBefore.toISOString())
    .limit(BATCH * 5);
  if (error) throw new Error(`meeting_transcripts: ${error.message}`);
  const ids = (data ?? [])
    .filter((r) => isExpired(r.created_at, c.transcriptsBefore))
    .map((r) => r.id);
  if (ids.length === 0) return { count: 0, full: false };
  const { error: del } = await db.from("meeting_transcripts").delete().in("id", ids);
  if (del) throw new Error(`meeting_transcripts delete: ${del.message}`);
  return { count: ids.length, full: (data ?? []).length === BATCH * 5 };
}

export async function runRetentionForAccount(
  accountId: string,
  privacy: unknown,
  now = new Date(),
): Promise<Purged> {
  const c = retentionCutoffs(now, privacy);
  const rec = await purgeCallRecordings(accountId, c);
  const tr = await purgeCallTranscripts(accountId, c);
  const mrec = await purgeMeetingRecordings(accountId, c);
  const mtr = await purgeMeetingTranscripts(accountId, c);
  const result: Purged = {
    call_recordings: rec.count,
    call_transcripts: tr.count,
    meeting_recordings: mrec.count,
    meeting_transcript_lines: mtr.count,
    more: rec.full || tr.full || mrec.full || mtr.full,
  };
  const total = rec.count + tr.count + mrec.count + mtr.count;
  // Registra sempre que apagou algo, e marca a passada do dia quando não sobrou nada vencido.
  if (total > 0 || !result.more) {
    await admin().rpc("audit", {
      _account: accountId,
      _action: result.more ? "retention.purged" : RUN_ACTION,
      _entity: "privacy",
      _entity_id: null as unknown as string,
      _meta: {
        ...result,
        recordings_days: c.recordingsDays,
        transcripts_days: c.transcriptsDays,
        recordings_before: c.recordingsBefore.toISOString(),
        transcripts_before: c.transcriptsBefore.toISOString(),
      },
    });
  }
  return result;
}

registerPeriodic("privacy.retention", async () => {
  const db = admin();
  const now = new Date();
  const { data: accounts, error } = await db.from("accounts").select("id, settings").limit(500);
  if (error) throw new Error(`accounts: ${error.message}`);
  // Uma consulta só: quem já teve a passada do dia nas últimas 20 h fica de fora.
  const since = new Date(now.getTime() - 20 * 3_600_000).toISOString();
  const { data: done } = await db
    .from("audit_log")
    .select("account_id, created_at")
    .eq("action", RUN_ACTION)
    .gte("created_at", since)
    .limit(5000);
  const lastRun = new Map((done ?? []).map((d) => [d.account_id, d.created_at]));
  for (const a of accounts ?? []) {
    if (!shouldRunRetention(lastRun.get(a.id), now)) continue;
    const settings = (a.settings ?? {}) as Record<string, unknown>;
    try {
      await runRetentionForAccount(a.id, settings["privacy"], now);
    } catch (err) {
      console.error(`[privacy.retention] conta ${a.id}`, err);
    }
  }
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
