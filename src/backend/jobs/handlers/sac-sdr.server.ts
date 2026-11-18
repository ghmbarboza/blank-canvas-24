// SAC e SDR em segundo plano: chamado resolvido vira rascunho de artigo (kb.draft), lead novo sem
// dono é roteado (lead.route) e a pontuação preditiva é retreinada uma vez por dia (sdr.train).
import { admin } from "@/backend/http.server";

import { onDomainEvents } from "../events.server";
import { registerJob, registerPeriodic } from "../registry.server";

onDomainEvents(async (events) => {
  const db = admin();
  for (const e of events) {
    if (!e.entity_id) continue;
    if (e.type === "ticket.resolved")
      await db.rpc("enqueue_job", {
        _account: e.account_id,
        _kind: "kb.draft",
        _payload: { ticket_id: e.entity_id },
        _run_at: new Date(Date.now() + 2 * 60_000).toISOString(),
        _dedupe: `kb.draft:${e.entity_id}`,
      });
    if (e.type === "contact.created")
      await db.rpc("enqueue_job", {
        _account: e.account_id,
        _kind: "lead.route",
        _payload: { contact_id: e.entity_id },
        _dedupe: `lead.route:${e.entity_id}`,
      });
  }
});

registerJob("kb.draft", async (job) => {
  const p = job.payload as { ticket_id?: string };
  if (!p.ticket_id) throw new Error("payload sem chamado");
  const { draftArticleFromTicket } = await import("@/backend/support/sac.server");
  try {
    return await draftArticleFromTicket(p.ticket_id);
  } catch (err) {
    // Sem IA configurada não é falha do job: o gestor ainda pode escrever o artigo à mão.
    const msg = err instanceof Error ? err.message : String(err);
    if (/Nenhum provedor de IA/.test(msg)) return { skipped: msg };
    throw err;
  }
});

registerJob("lead.route", async (job) => {
  const p = job.payload as { contact_id?: string; deal_id?: string | null };
  if (!p.contact_id || !job.account_id) throw new Error("payload sem contato");
  const { routeContact } = await import("@/backend/sdr/sdr.server");
  const result = await routeContact(job.account_id, p.contact_id);
  if (p.deal_id) {
    const { data: contact, error: readError } = await admin()
      .from("contacts")
      .select("owner_user_id")
      .eq("id", p.contact_id)
      .eq("account_id", job.account_id)
      .single();
    if (readError) throw readError;
    if (contact.owner_user_id) {
      const { error } = await admin()
        .from("deals")
        .update({ owner_user_id: contact.owner_user_id })
        .eq("id", p.deal_id)
        .eq("account_id", job.account_id)
        .is("owner_user_id", null);
      if (error) throw error;
    }
  }
  return result;
});

registerJob("sdr.train", async (job) => {
  if (!job.account_id) throw new Error("job sem conta");
  const { trainAndScore } = await import("@/backend/sdr/sdr.server");
  return { ...(await trainAndScore(job.account_id)) };
});

let lastCheck = 0;
registerPeriodic("sdr.train.daily", async () => {
  if (Date.now() - lastCheck < 60 * 60_000) return;
  lastCheck = Date.now();
  const db = admin();
  const [{ data: accs }, { data: models }] = await Promise.all([
    db.from("accounts").select("id").limit(500),
    db.from("lead_score_models").select("account_id, trained_at"),
  ]);
  const last = new Map((models ?? []).map((m) => [m.account_id, new Date(m.trained_at).getTime()]));
  const day = new Date().toISOString().slice(0, 10);
  for (const a of accs ?? []) {
    if (Date.now() - (last.get(a.id) ?? 0) < 23 * 3_600_000) continue;
    await db.rpc("enqueue_job", {
      _account: a.id,
      _kind: "sdr.train",
      _payload: {},
      _dedupe: `sdr.train:${a.id}:${day}`,
    });
  }
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
