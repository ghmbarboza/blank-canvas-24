// Jobs de e-mail: envio avulso (automação, convite, 1:1 agendado) e lotes de campanha.
import { admin } from "@/backend/http.server";
import { enqueueCampaignBatch, runCampaignBatch } from "@/backend/email/campaign.server";
import { sellerName, sendEmail } from "@/backend/email/core.server";
import { contactVars } from "@/features/email/render";

import type { JobPayloads } from "../contract";
import { registerJob } from "../registry.server";

registerJob("email.send", async (job) => {
  const p = job.payload as unknown as JobPayloads["email.send"];
  if (!job.account_id || !p?.to_email || !p.subject || !p.html)
    throw new Error("payload incompleto");
  let vars = {};
  if (p.to_contact_id) {
    const { data: c } = await admin()
      .from("contacts")
      .select("name, email, phone, company, job_title, city, custom, owner_user_id")
      .eq("id", p.to_contact_id)
      .eq("account_id", job.account_id)
      .maybeSingle();
    if (c) vars = contactVars(c, await sellerName(c.owner_user_id));
  }
  const r = await sendEmail({
    accountId: job.account_id,
    kind: p.automation_run_id ? "automation" : p.campaign_id ? "campaign" : "transactional",
    category: p.category,
    to: p.to_email,
    subject: p.subject,
    html: p.html,
    text: p.text ?? null,
    vars,
    contactId: p.to_contact_id ?? null,
    campaignId: p.campaign_id ?? null,
    automationRunId: p.automation_run_id ?? null,
    userId: p.from_user_id ?? null,
    replyTo: p.reply_to ?? null,
  });
  return { ...r };
});

interface CampaignPayload {
  campaign_id: string;
  cursor: string | null;
}

registerJob("email.campaign", async (job) => {
  const p = job.payload as unknown as CampaignPayload;
  if (!job.account_id || !p?.campaign_id) throw new Error("payload incompleto");
  const db = admin();
  // Campanha agendada: o job nasce com run_at = scheduled_at e liga o envio aqui.
  await db
    .from("email_campaigns")
    .update({ status: "sending", started_at: new Date().toISOString() })
    .eq("id", p.campaign_id)
    .eq("status", "scheduled");
  const r = await runCampaignBatch(p.campaign_id, p.cursor ?? null);
  if (!r.done) await enqueueCampaignBatch(job.account_id, p.campaign_id, r.cursor, r.waitUntil);
  return { ...r };
});

// Referenciado em handlers.server.ts para o módulo não ser descartado no build.
export const registered = true;
