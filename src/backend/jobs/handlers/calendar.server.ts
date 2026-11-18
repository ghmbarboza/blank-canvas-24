// Agenda pessoal do anfitrião (Google Agenda ou Outlook) nos dois sentidos.
// - calendar.push: reunião criada, remarcada ou cancelada no Nexus → cria, atualiza ou apaga o
//   evento externo (o gatilho meetings_enqueue_calendar_push enfileira nas mudanças).
// - calendar.pull: lê o que mudou numa agenda conectada (Google syncToken / Graph delta) e
//   remarca ou cancela a reunião nossa cujo evento foi mexido lá; avisa o anfitrião.
// - calendar.sync (periódica): a cada tick, enfileira o pull das conexões sem leitura há 10 min.
import { admin } from "@/backend/http.server";
import { pullConnection, pushMeeting } from "@/backend/calendar/sync.server";

import type { JobPayloads } from "../contract";
import { registerJob, registerPeriodic } from "../registry.server";

const PULL_EVERY_MS = 10 * 60_000;
const PULLS_PER_TICK = 20;

registerJob("calendar.push", async (job) => {
  const { meeting_id } = job.payload as unknown as JobPayloads["calendar.push"];
  return pushMeeting(meeting_id);
});

registerJob("calendar.pull", async (job) => {
  const { connection_id } = job.payload as unknown as JobPayloads["calendar.pull"];
  return pullConnection(connection_id);
});

registerPeriodic("calendar.sync", async () => {
  const db = admin();
  const due = new Date(Date.now() - PULL_EVERY_MS).toISOString();
  const { data } = await db
    .from("calendar_connections")
    .select("id, account_id")
    .eq("status", "connected")
    .or(`last_pull_at.is.null,last_pull_at.lt.${due}`)
    .order("last_pull_at", { ascending: true, nullsFirst: true })
    .limit(PULLS_PER_TICK);
  for (const c of data ?? []) {
    // marca antes de enfileirar: conexão com erro não vira tentativa a cada minuto
    await db
      .from("calendar_connections")
      .update({ last_pull_at: new Date().toISOString() })
      .eq("id", c.id);
    await db.rpc("enqueue_job", {
      _account: c.account_id,
      _kind: "calendar.pull",
      _payload: { connection_id: c.id },
      _dedupe: `calendar.pull:${c.id}`,
    });
  }
});

export const registered = true;
