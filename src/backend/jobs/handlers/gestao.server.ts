// Gestão: sincronização periódica com o CRM que o cliente já tem (RD Station CRM, HubSpot).
// Job "crm.sync" { provider }. A tarefa periódica enfileira cada conexão ativa a cada 30 min.
import { randomUUID } from "node:crypto";

import { admin } from "@/backend/http.server";
import type { SyncProvider } from "@/features/gestao/sync/types";

import { registerJob, registerPeriodic } from "../registry.server";

const EVERY_MS = 30 * 60_000;
const PER_TICK = 10;

registerJob("crm.sync", async (job) => {
  const provider = (job.payload as { provider?: string } | null)?.provider;
  if (!job.account_id || (provider !== "rdstation_crm" && provider !== "hubspot"))
    throw new Error("payload incompleto");
  const { runSync } = await import("@/backend/gestao/sync.server");
  const result = await runSync(job.account_id, provider as SyncProvider, randomUUID());
  return { ...result };
});

registerPeriodic("crm.sync.schedule", async () => {
  const db = admin();
  const due = new Date(Date.now() - EVERY_MS).toISOString();
  const { data } = await db
    .from("crm_sync_connections")
    .select("account_id, provider")
    .eq("status", "connected")
    .or(`last_sync_at.is.null,last_sync_at.lt.${due}`)
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(PER_TICK);
  for (const c of data ?? []) {
    // marca antes de enfileirar: conexão com erro não vira tentativa a cada minuto
    await db
      .from("crm_sync_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("account_id", c.account_id)
      .eq("provider", c.provider);
    await db.rpc("enqueue_job", {
      _account: c.account_id,
      _kind: "crm.sync",
      _payload: { provider: c.provider },
      _dedupe: `crm.sync:${c.account_id}:${c.provider}`,
    });
  }
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
