// Qualidade em 100% das interações: a cada tick a varredura acha interações terminadas sem nota
// e enfileira uma avaliação por interação (dedupe). O avaliador respeita o teto de custo da conta.
import { admin } from "@/backend/http.server";

import { registerJob, registerPeriodic } from "../registry.server";

const PER_TICK = 20;

registerPeriodic("quality.sweep", async () => {
  const db = admin();
  const { data, error } = await db.rpc("quality_pending", { _limit: PER_TICK });
  if (error) throw new Error(`quality_pending: ${error.message}`);
  for (const r of data ?? []) {
    await db.rpc("enqueue_job", {
      _account: r.account_id,
      _kind: "quality.evaluate",
      _payload: {
        source: r.source,
        source_id: r.source_id,
        interaction_start: r.interaction_start,
        interaction_end: r.interaction_end,
      },
      _dedupe: `quality:${r.source}:${r.source_id}:${r.interaction_end}`,
    });
  }
});

registerJob("quality.evaluate", async (job) => {
  const p = job.payload as {
    source?: "conversation" | "call";
    source_id?: string;
    interaction_start?: string | null;
    interaction_end?: string;
  };
  if (!job.account_id || !p.source || !p.source_id || !p.interaction_end)
    throw new Error("payload incompleto");
  const { evaluateInteraction } = await import("@/backend/quality/evaluate.server");
  const r = await evaluateInteraction({
    account_id: job.account_id,
    source: p.source,
    source_id: p.source_id,
    interaction_start: p.interaction_start ?? null,
    interaction_end: p.interaction_end,
  });
  return { ...r };
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
