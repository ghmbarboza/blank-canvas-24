// Campanha de WhatsApp (#67): manda um lote de destinatários por rodada e se reagenda até acabar.
// Cada envio é o sendWhatsApp das automações (consentimento de marketing, supressão, horário
// silencioso, conversa, template). Horário silencioso adia o destinatário, não o pula.
import { admin } from "@/backend/http.server";
import {
  CAMPAIGN_BATCH,
  CAMPAIGN_PACE_MS,
  renderCampaignParams,
} from "@/backend/campaigns/whatsapp-params";
import { registerJob } from "../registry.server";

// Campanha agendada: na hora marcada, monta o público e dispara (só se ninguém mudou a hora).
registerJob("whatsapp.campaign_start", async (job) => {
  const p = job.payload as { campaign_id?: string; at?: string };
  if (!p.campaign_id || !p.at) throw new Error("payload sem campanha ou hora");
  // tudo no banco, com a linha travada: confere status e hora e dispara (ou explica por que não)
  const { data, error } = await admin().rpc(
    "_start_scheduled_whatsapp_campaign" as never,
    { _campaign: p.campaign_id, _at: p.at } as never,
  );
  if (error) throw new Error(`disparo agendado: ${error.message}`);
  return data as unknown as Record<string, unknown>;
});

registerJob("whatsapp.campaign", async (job) => {
  const p = job.payload as { campaign_id?: string };
  const db = admin();
  const { data: c } = await db
    .from("whatsapp_campaigns")
    .select("id, account_id, status, channel_id, template_name, template_language, template_params")
    .eq("id", p.campaign_id ?? "")
    .maybeSingle();
  if (!c || c.status !== "sending") return { skipped: "campanha não está disparando" };

  const { data: batch } = await db
    .from("whatsapp_campaign_targets")
    .select("id, contact_id, contacts(name)")
    .eq("campaign_id", c.id)
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(CAMPAIGN_BATCH);

  const { sendWhatsApp } = await import("@/backend/messaging.server");
  const counts = { sent: 0, skipped: 0, deferred: 0, failed: 0 };
  for (const t of batch ?? []) {
    const name = (t.contacts as unknown as { name: string | null } | null)?.name ?? null;
    try {
      const r = await sendWhatsApp({
        accountId: c.account_id,
        contactId: t.contact_id,
        channelId: c.channel_id,
        category: "marketing",
        senderType: "system",
        template: {
          name: c.template_name,
          language: c.template_language,
          params: renderCampaignParams(c.template_params ?? [], name),
        },
      });
      if (r.status === "sent") {
        counts.sent++;
        await db
          .from("whatsapp_campaign_targets")
          .update({
            status: "sent",
            message_id: r.messageId ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", t.id);
      } else if (r.status === "deferred") {
        counts.deferred++;
        await db
          .from("whatsapp_campaign_targets")
          .update({
            next_attempt_at: r.deferUntil ?? new Date(Date.now() + 3600_000).toISOString(),
          })
          .eq("id", t.id);
      } else {
        counts.skipped++;
        await db
          .from("whatsapp_campaign_targets")
          .update({ status: "skipped", reason: (r.reason ?? "pulado").slice(0, 300) })
          .eq("id", t.id);
      }
    } catch (err) {
      counts.failed++;
      await db
        .from("whatsapp_campaign_targets")
        .update({
          status: "failed",
          reason: String(err instanceof Error ? err.message : err).slice(0, 300),
        })
        .eq("id", t.id);
    }
  }

  const { data: next } = await db
    .from("whatsapp_campaign_targets")
    .select("next_attempt_at")
    .eq("campaign_id", c.id)
    .eq("status", "queued")
    .order("next_attempt_at")
    .limit(1)
    .maybeSingle();
  if (!next) {
    await db
      .from("whatsapp_campaigns")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "sending");
    return { ...counts, done: true };
  }
  const runAt = new Date(
    Math.max(Date.now() + CAMPAIGN_PACE_MS, new Date(next.next_attempt_at).getTime()),
  );
  await db.rpc("enqueue_job", {
    _account: c.account_id,
    _kind: "whatsapp.campaign",
    _payload: { campaign_id: c.id },
    _run_at: runAt.toISOString(),
    _dedupe: `wa-camp:${c.id}:${runAt.getTime()}`,
  });
  return { ...counts, next: runAt.toISOString() };
});

export const registered = true;
