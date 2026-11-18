// Motor de envio de e-mail (um despachante só, para 1:1, automação, convite e campanha).
// Lição EasyCover: dois despachantes com regras divergentes foi a origem de quase todos os bugs.
import { createHmac, timingSafeEqual } from "node:crypto";

import { admin, appBaseUrl } from "@/backend/http.server";
import { accountTransport, type EmailTransport } from "@/backend/email/transport.server";
import { htmlToText, renderVariables, withTracking, type EmailVars } from "@/features/email/render";

export interface SendInput {
  accountId: string;
  kind: "campaign" | "automation" | "one_to_one" | "transactional" | "reply" | "test";
  category: "transactional" | "marketing";
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  vars?: EmailVars;
  contactId?: string | null;
  dealId?: string | null;
  conversationId?: string | null;
  campaignId?: string | null;
  automationRunId?: string | null;
  userId?: string | null;
  replyTo?: string | null;
  fromName?: string | null;
  headers?: Record<string, string>;
  /** Anexos já em base64 (resposta 1:1); campanha nunca leva anexo. */
  attachments?: { filename: string; content: string; content_type?: string }[];
}

export interface SendResult {
  id: string | null;
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

export interface Sender {
  /** Provedor ativo da conta (Resend por padrão, ou Amazon SES). */
  transport: EmailTransport;
  from: string;
  replyTo: string | null;
  brand: string;
  address: string | null;
  signature: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmail(v: string | null | undefined): v is string {
  return typeof v === "string" && EMAIL_RE.test(v.trim());
}

export async function getSender(accountId: string, fromName?: string | null): Promise<Sender> {
  const { transport, sender } = await accountTransport(accountId);
  const { data: acc } = await admin()
    .from("accounts")
    .select("name, settings")
    .eq("id", accountId)
    .single();
  const emailCfg = ((acc?.settings as Record<string, unknown> | null)?.["email"] ?? {}) as Record<
    string,
    string
  >;
  const name = fromName || sender.fromName || acc?.name || "Nexus One";
  return {
    transport,
    from: `${name.replace(/[<>"\r\n]/g, "")} <${sender.fromEmail}>`,
    replyTo: sender.replyTo,
    brand: acc?.name ?? name,
    address: emailCfg["address"] || null,
    signature: emailCfg["signature"] || null,
  };
}

// ── descadastro assinado (HMAC, POST de um clique) ─────────────────────────────
let linkSecret: string | null = null;
async function secret(): Promise<string> {
  if (!linkSecret) {
    const { data, error } = await admin().rpc("email_link_secret");
    if (error || !data) throw new Error("segredo dos links de e-mail indisponível");
    linkSecret = data as string;
  }
  return linkSecret;
}

export async function signUnsubscribe(accountId: string, email: string): Promise<string> {
  return createHmac("sha256", await secret())
    .update(`unsub:${accountId}:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export async function verifyUnsubscribe(
  accountId: string,
  email: string,
  sig: string | null,
): Promise<boolean> {
  if (!sig || !accountId || !email) return false;
  const expected = Buffer.from(await signUnsubscribe(accountId, email));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function unsubscribeUrl(
  accountId: string,
  email: string,
  messageId?: string,
): Promise<string> {
  const e = email.trim().toLowerCase();
  const h = await signUnsubscribe(accountId, e);
  return `${appBaseUrl()}/api/public/email/unsubscribe?a=${accountId}&e=${encodeURIComponent(e)}&h=${h}${messageId ? `&m=${messageId}` : ""}`;
}

export function unsubscribeHeaders(link: string): Record<string, string> {
  return { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

// ── pode mandar? (supressão e consentimento valem para marketing) ──────────────
export async function blockReason(
  accountId: string,
  to: string,
  contactId: string | null | undefined,
): Promise<string | null> {
  const db = admin();
  const addr = to.trim().toLowerCase();
  const { data: sup } = await db
    .from("suppressions")
    .select("reason")
    .eq("account_id", accountId)
    .eq("channel", "email")
    .eq("address", addr)
    .maybeSingle();
  if (sup) return `suprimido (${sup.reason})`;
  if (contactId) {
    const { data: st } = await db
      .from("contact_consent_state")
      .select("status")
      .eq("contact_id", contactId)
      .eq("channel", "email")
      .maybeSingle();
    if (st?.status === "revoked") return "consentimento revogado";
  }
  return null;
}

async function recordSkip(
  input: SendInput,
  reason: string,
  status: "skipped" | "failed",
): Promise<SendResult> {
  const { data } = await admin()
    .from("email_messages")
    .insert({
      account_id: input.accountId,
      kind: input.kind,
      category: input.category,
      campaign_id: input.campaignId ?? null,
      automation_run_id: input.automationRunId ?? null,
      contact_id: input.contactId ?? null,
      deal_id: input.dealId ?? null,
      user_id: input.userId ?? null,
      to_email: input.to || "(sem e-mail)",
      subject: input.subject.slice(0, 200),
      status,
      ...(status === "skipped" ? { skip_reason: reason } : { error: reason }),
    })
    .select("id")
    .single();
  return { id: data?.id ?? null, status, reason };
}

/**
 * Envia um e-mail: checa endereço, supressão/consentimento (marketing), troca variáveis (barra se
 * faltar alguma), registra a mensagem, rastreia e manda pelo provedor ativo da conta (Resend ou SES).
 */
export async function sendEmail(input: SendInput, sender?: Sender): Promise<SendResult> {
  const db = admin();
  if (!isValidEmail(input.to)) return recordSkip(input, "contato sem e-mail válido", "skipped");
  const to = input.to.trim().toLowerCase();
  if (input.category === "marketing") {
    const reason = await blockReason(input.accountId, to, input.contactId);
    if (reason) return recordSkip({ ...input, to }, reason, "skipped");
  }
  const subj = renderVariables(input.subject, input.vars ?? {}, false);
  const body = renderVariables(input.html, input.vars ?? {}, true);
  const missing = [...new Set([...subj.missing, ...body.missing])];
  if (missing.length)
    return recordSkip({ ...input, to }, `variáveis sem valor: ${missing.join(", ")}`, "failed");

  const s = sender ?? (await getSender(input.accountId, input.fromName));
  const { data: row, error } = await db
    .from("email_messages")
    .insert({
      account_id: input.accountId,
      kind: input.kind,
      category: input.category,
      campaign_id: input.campaignId ?? null,
      automation_run_id: input.automationRunId ?? null,
      contact_id: input.contactId ?? null,
      deal_id: input.dealId ?? null,
      conversation_id: input.conversationId ?? null,
      user_id: input.userId ?? null,
      to_email: to,
      subject: subj.out.slice(0, 200),
      preview: htmlToText(body.out).slice(0, 280),
    })
    .select("id")
    .single();
  if (error || !row) throw new Error(`email_messages: ${error?.message ?? "sem linha"}`);

  const unsub =
    input.category === "marketing" ? await unsubscribeUrl(input.accountId, to, row.id) : null;
  const tracked = withTracking(body.out, {
    base: appBaseUrl(),
    messageId: row.id,
    unsubscribeUrl: unsub,
  });
  try {
    const sent = await s.transport.send({
      from: s.from,
      to: [to],
      subject: subj.out,
      html: tracked.html,
      text: input.text ?? htmlToText(tracked.html),
      replyTo: input.replyTo ?? s.replyTo,
      headers: { ...(unsub ? unsubscribeHeaders(unsub) : {}), ...(input.headers ?? {}) },
      tags: [{ name: "nexus_message", value: row.id }],
      ...(input.attachments?.length && input.category === "transactional"
        ? { attachments: input.attachments }
        : {}),
    });
    const now = new Date().toISOString();
    await db
      .from("email_messages")
      .update({ status: "sent", provider_id: sent.id, sent_at: now, links: tracked.links })
      .eq("id", row.id);
    await db
      .from("email_events")
      .insert({ account_id: input.accountId, email_message_id: row.id, type: "sent" });
    await db.from("usage_ledger").insert({
      account_id: input.accountId,
      kind: "email",
      quantity: 1,
      unit: "email",
      cost_usd: 0.0009,
      ref_table: "email_messages",
      ref_id: row.id,
    });
    return { id: row.id, status: "sent" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .from("email_messages")
      .update({ status: "failed", error: msg.slice(0, 500) })
      .eq("id", row.id);
    return { id: row.id, status: "failed", reason: msg };
  }
}

export async function sellerName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin()
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? null;
}
