// Disparo de campanha em lotes pela fila (job "email.campaign"): aquecimento por degraus, teto de
// 1 e-mail de marketing por pessoa por dia, cursor por id (continuação não reenvia), contato sem
// e-mail pulado sem custo, supressão e consentimento respeitados.
import { admin, appBaseUrl } from "@/backend/http.server";
import { warmupLimit } from "@/features/email/dns";
import {
  blocksToHtml,
  contactVars,
  htmlToText,
  isEmailBlocks,
  renderVariables,
  withTracking,
} from "@/features/email/render";
import { applySegment, isSegmentFilter, type SegmentFilter } from "@/features/segments/rules";

import { getSender, isValidEmail, unsubscribeHeaders, unsubscribeUrl } from "./core.server";

export interface CampaignBatchResult {
  sent: number;
  skipped: number;
  failed: number;
  done: boolean;
  cursor: string | null;
  waitUntil?: string;
}

async function campaignFilter(c: {
  segment_id: string | null;
  segment_filter: unknown;
}): Promise<SegmentFilter | null> {
  if (isSegmentFilter(c.segment_filter)) return c.segment_filter;
  if (!c.segment_id) return null;
  const { data } = await admin()
    .from("segments")
    .select("filter")
    .eq("id", c.segment_id)
    .maybeSingle();
  return isSegmentFilter(data?.filter) ? data.filter : null;
}

export async function marketingSentToday(accountId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin()
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("category", "marketing")
    .neq("kind", "test")
    .in("status", ["sent", "delivered", "opened", "clicked", "queued"])
    .gte("created_at", since);
  return count ?? 0;
}

export async function runCampaignBatch(
  campaignId: string,
  cursor: string | null,
): Promise<CampaignBatchResult> {
  const db = admin();
  const { data: c } = await db
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!c || c.status !== "sending") return { sent: 0, skipped: 0, failed: 0, done: true, cursor };

  const sender = await getSender(c.account_id);
  const domain = sender.from.match(/@([^>]+)>?$/)?.[1]?.toLowerCase() ?? "";
  const { data: dom } = await db
    .from("email_domains")
    .select("id, warmup_started_at")
    .eq("account_id", c.account_id)
    .eq("domain", domain)
    .maybeSingle();
  if (dom && !dom.warmup_started_at) {
    await db
      .from("email_domains")
      .update({ warmup_started_at: new Date().toISOString() })
      .eq("id", dom.id);
  }
  const limit = warmupLimit(dom?.warmup_started_at ?? new Date().toISOString());
  const room = Number.isFinite(limit)
    ? limit - (await marketingSentToday(c.account_id))
    : c.batch_size;
  if (room <= 0) {
    const wait = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db
      .from("email_campaigns")
      .update({ last_error: `Teto diário de aquecimento (${limit}) atingido; retoma em 1 h.` })
      .eq("id", c.id);
    return { sent: 0, skipped: 0, failed: 0, done: false, cursor, waitUntil: wait };
  }
  const size = Math.max(1, Math.min(c.batch_size, room, 100));

  const filter = await campaignFilter(c);
  let q = db
    .from("contacts")
    .select("id, name, email, phone, company, job_title, city, custom, owner_user_id")
    .eq("account_id", c.account_id)
    .order("id")
    .limit(size);
  if (cursor) q = q.gt("id", cursor);
  q = applySegment(q, filter);
  const { data: people, error } = await q;
  if (error) throw new Error(`audiência: ${error.message}`);
  const list = people ?? [];
  const nextCursor = list.length ? list[list.length - 1]!.id : cursor;

  const emails = list.map((p) => (p.email ?? "").trim().toLowerCase()).filter(Boolean);
  const [{ data: sup }, { data: revoked }, { data: today }] = await Promise.all([
    db
      .from("suppressions")
      .select("address")
      .eq("account_id", c.account_id)
      .eq("channel", "email")
      .in("address", emails.length ? emails : ["-"]),
    db
      .from("contact_consent_state")
      .select("contact_id")
      .eq("channel", "email")
      .eq("status", "revoked")
      .in(
        "contact_id",
        list.length ? list.map((p) => p.id) : ["00000000-0000-0000-0000-000000000000"],
      ),
    db.rpc("email_marketing_sent_today", {
      _account: c.account_id,
      _emails: emails.length ? emails : ["-"],
    }),
  ]);
  const supSet = new Set((sup ?? []).map((s) => s.address));
  const revokedSet = new Set((revoked ?? []).map((r) => r.contact_id));
  const todaySet = new Set(((today ?? []) as { to_email: string }[]).map((t) => t.to_email));

  const sellers = new Map<string, string>();
  const ownerIds = [
    ...new Set(list.map((p) => p.owner_user_id).filter((x): x is string => Boolean(x))),
  ];
  if (ownerIds.length) {
    const { data: profs } = await db.from("profiles").select("id, full_name").in("id", ownerIds);
    for (const p of profs ?? []) sellers.set(p.id, p.full_name ?? "");
  }

  const blocks = isEmailBlocks(c.blocks) ? c.blocks : [];
  const baseHtml =
    c.html ||
    blocksToHtml(blocks, {
      preheader: c.preheader,
      brand: { name: sender.brand, address: sender.address },
      marketing: true,
    });
  const out = { sent: 0, skipped: 0, failed: 0 };
  const toSend: {
    rowId: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    headers: Record<string, string>;
    links: string[];
  }[] = [];

  for (const p of list) {
    const to = (p.email ?? "").trim().toLowerCase();
    let reason: string | null = null;
    if (!isValidEmail(to)) reason = "contato sem e-mail válido";
    else if (supSet.has(to)) reason = "suprimido";
    else if (revokedSet.has(p.id)) reason = "consentimento revogado";
    else if (todaySet.has(to)) reason = "já recebeu marketing hoje";
    const vars = contactVars(p, p.owner_user_id ? sellers.get(p.owner_user_id) : null);
    const subj = renderVariables(c.subject, vars, false);
    const body = renderVariables(baseHtml, vars, true);
    const missing = [...new Set([...subj.missing, ...body.missing])];
    if (!reason && missing.length) reason = `variáveis sem valor: ${missing.join(", ")}`;

    const { data: row, error: insErr } = await db
      .from("email_messages")
      .insert({
        account_id: c.account_id,
        kind: "campaign",
        category: "marketing",
        campaign_id: c.id,
        contact_id: p.id,
        to_email: to || "(sem e-mail)",
        subject: subj.out.slice(0, 200),
        preview: htmlToText(body.out).slice(0, 280),
        status: reason ? "skipped" : "queued",
        skip_reason: reason,
      })
      .select("id")
      .maybeSingle();
    // 23505 = já estava na campanha (índice único campanha+contato): continuação não reenvia.
    if (insErr?.code === "23505" || !row) continue;
    if (reason) {
      out.skipped += 1;
      continue;
    }
    const unsub = await unsubscribeUrl(c.account_id, to, row.id);
    const tracked = withTracking(body.out, {
      base: appBaseUrl(),
      messageId: row.id,
      unsubscribeUrl: unsub,
    });
    toSend.push({
      rowId: row.id,
      to,
      subject: subj.out,
      html: tracked.html,
      text: htmlToText(tracked.html),
      headers: unsubscribeHeaders(unsub),
      links: tracked.links,
    });
  }

  if (toSend.length) {
    try {
      const ids = await sender.transport.sendMany(
        toSend.map((m) => ({
          from: sender.from,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          replyTo: sender.replyTo,
          headers: m.headers,
          tags: [
            { name: "nexus_message", value: m.rowId },
            { name: "nexus_campaign", value: c.id },
          ],
        })),
      );
      const now = new Date().toISOString();
      await Promise.all(
        toSend.map((m, i) =>
          db
            .from("email_messages")
            .update({
              status: "sent",
              provider_id: ids[i]?.id ?? null,
              sent_at: now,
              links: m.links,
            })
            .eq("id", m.rowId),
        ),
      );
      await db.from("usage_ledger").insert({
        account_id: c.account_id,
        kind: "email",
        quantity: toSend.length,
        unit: "email",
        cost_usd: 0.0009 * toSend.length,
        ref_table: "email_campaigns",
        ref_id: c.id,
      });
      out.sent += toSend.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .from("email_messages")
        .update({ status: "failed", error: msg.slice(0, 500) })
        .in(
          "id",
          toSend.map((m) => m.rowId),
        );
      await db
        .from("email_campaigns")
        .update({ last_error: msg.slice(0, 500) })
        .eq("id", c.id);
      out.failed += toSend.length;
    }
  }

  const done = list.length < size;
  if (done) {
    await db
      .from("email_campaigns")
      .update({ status: "sent", finished_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "sending");
  }
  return { ...out, done, cursor: nextCursor };
}

export async function enqueueCampaignBatch(
  accountId: string,
  campaignId: string,
  cursor: string | null,
  runAt?: string,
) {
  await admin().rpc("enqueue_job", {
    _account: accountId,
    _kind: "email.campaign",
    _payload: { campaign_id: campaignId, cursor },
    ...(runAt ? { _run_at: runAt } : {}),
    _dedupe: `email.campaign:${campaignId}:${cursor ?? "start"}`,
  });
}

export async function estimateAudience(
  accountId: string,
  filter: SegmentFilter | null,
): Promise<number> {
  const q = applySegment(
    admin()
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("email", "is", null),
    filter,
  );
  const { count } = await q;
  return count ?? 0;
}
