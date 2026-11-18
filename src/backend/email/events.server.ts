import { BRAND } from "@/lib/brand";
// Eventos de e-mail vindos de fora: abertura (pixel), clique, descadastro, webhook do Resend e
// e-mail recebido (caixa compartilhada). Tudo público, então tudo valida antes de gravar.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { admin } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import { resendReceived } from "@/backend/providers/resend.server";
import { escapeHtml, isAllowedRedirect } from "@/features/email/render";

import { isAutomatedEmail } from "./auto-reply";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ipHash(ip: string | null): string | null {
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
}

async function emit(
  accountId: string,
  type: string,
  messageId: string,
  payload: Record<string, unknown>,
) {
  await admin().rpc("emit_event", {
    _account: accountId,
    _type: type,
    _entity: "email",
    _entity_id: messageId,
    _payload: payload as never,
  });
}

export async function trackOpen(id: string, ua: string | null, ip: string | null): Promise<void> {
  if (!UUID.test(id)) return;
  const db = admin();
  const { data: m } = await db
    .from("email_messages")
    .select("id, account_id, contact_id, status, opened_at, open_count, campaign_id")
    .eq("id", id)
    .maybeSingle();
  if (!m) return;
  const first = !m.opened_at;
  const now = new Date().toISOString();
  await db
    .from("email_messages")
    .update({
      open_count: m.open_count + 1,
      ...(first ? { opened_at: now } : {}),
      ...(["sent", "delivered"].includes(m.status) ? { status: "opened" } : {}),
    })
    .eq("id", id);
  await db.from("email_events").insert({
    account_id: m.account_id,
    email_message_id: id,
    type: "open",
    user_agent: ua?.slice(0, 300) ?? null,
    ip_hash: ipHash(ip),
  });
  if (first)
    await emit(m.account_id, "email.opened", id, {
      contact_id: m.contact_id,
      campaign_id: m.campaign_id,
    });
}

export async function trackClick(
  id: string,
  url: string,
  cta: string | null,
  ua: string | null,
  ip: string | null,
): Promise<string | null> {
  if (!UUID.test(id)) return null;
  const db = admin();
  const { data: m } = await db
    .from("email_messages")
    .select(
      "id, account_id, contact_id, status, opened_at, clicked_at, click_count, first_cta, links, campaign_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!m || !isAllowedRedirect(url, m.links ?? [])) return null;
  const first = !m.clicked_at;
  const now = new Date().toISOString();
  await db
    .from("email_messages")
    .update({
      click_count: m.click_count + 1,
      status: ["bounced", "complained"].includes(m.status) ? m.status : "clicked",
      ...(first ? { clicked_at: now, first_cta: cta?.slice(0, 60) ?? null } : {}),
      ...(m.opened_at ? {} : { opened_at: now }),
    })
    .eq("id", id);
  await db.from("email_events").insert({
    account_id: m.account_id,
    email_message_id: id,
    type: "click",
    url: url.slice(0, 1000),
    cta: cta?.slice(0, 60) ?? null,
    user_agent: ua?.slice(0, 300) ?? null,
    ip_hash: ipHash(ip),
  });
  if (first)
    await emit(m.account_id, "email.clicked", id, {
      contact_id: m.contact_id,
      campaign_id: m.campaign_id,
      url,
      cta,
    });
  return url;
}

export async function unsubscribe(
  accountId: string,
  email: string,
  messageId: string | null,
): Promise<void> {
  const db = admin();
  const addr = email.trim().toLowerCase();
  await db.from("suppressions").upsert(
    {
      account_id: accountId,
      channel: "email",
      address: addr,
      reason: "unsubscribe",
      source: "link no e-mail",
    },
    { onConflict: "account_id,channel,address", ignoreDuplicates: true },
  );
  const { data: contacts } = await db
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .ilike("email", addr);
  for (const c of contacts ?? []) {
    await db.from("consents").insert({
      account_id: accountId,
      contact_id: c.id,
      channel: "email",
      status: "revoked",
      basis: "consent",
      source: "descadastro",
      proof: { message_id: messageId, at: new Date().toISOString() },
    });
  }
  await db.rpc("emit_event", {
    _account: accountId,
    _type: "email.unsubscribed",
    _entity: "email",
    _entity_id: messageId && UUID.test(messageId) ? messageId : (contacts?.[0]?.id ?? null),
    _payload: { email: addr, contact_id: contacts?.[0]?.id ?? null } as never,
  } as never);
  if (messageId && UUID.test(messageId)) {
    await db
      .from("email_events")
      .insert({ account_id: accountId, email_message_id: messageId, type: "unsubscribe" });
  }
}

// ── páginas do descadastro (escapadas: o e-mail vem da URL) ───────────────────
function frame(brand: string, inner: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(brand)}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6fa;font-family:Manrope,-apple-system,Segoe UI,sans-serif;color:#001F35"><main style="max-width:440px;margin:24px;padding:32px;background:#fff;border-radius:24px;box-shadow:0 1px 3px rgba(0, 31, 53,.08);text-align:center">${inner}</main></body></html>`;
}

export function confirmPage(brand: string, email: string, action: string): string {
  return frame(
    brand,
    `<h1 style="font-size:22px;margin:0 0 8px">Parar de receber e-mails?</h1><p style="color:#5b6478;margin:0 0 20px;font-size:15px">O endereço <b>${escapeHtml(email)}</b> deixa de receber as campanhas de ${escapeHtml(brand)}. E-mails de atendimento e cobrança continuam.</p><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="confirmar" value="1"><button type="submit" style="font:inherit;font-weight:600;padding:12px 24px;border:0;border-radius:999px;background:#001F35;color:#fff;cursor:pointer">Sim, descadastrar</button></form>`,
  );
}

export function donePage(brand: string, email: string): string {
  return frame(
    brand,
    `<h1 style="font-size:22px;margin:0 0 8px">Pronto</h1><p style="color:#5b6478;margin:0;font-size:15px"><b>${escapeHtml(email)}</b> não vai mais receber campanhas de ${escapeHtml(brand)}.</p>`,
  );
}

export function invalidPage(): string {
  return frame(
    BRAND.name,
    `<h1 style="font-size:22px;margin:0 0 8px">Link inválido</h1><p style="color:#5b6478;margin:0;font-size:15px">Abra o link de descadastro direto do e-mail que você recebeu.</p>`,
  );
}

export function isOneClickBody(body: string): boolean {
  const b = String(body ?? "").trim();
  if (!b || b.startsWith("{")) return false;
  const p = new URLSearchParams(b);
  return p.get("List-Unsubscribe") === "One-Click" || p.get("confirmar") === "1";
}

// ── webhook do Resend (svix) ───────────────────────────────────────────────────
export function verifySvix(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return sigs.split(" ").some((part) => {
    const sig = part.split(",")[1] ?? "";
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

async function integrationError(accountId: string, msg: string) {
  await admin()
    .from("account_integrations")
    .update({ status: "error", last_error: msg })
    .eq("account_id", accountId)
    .eq("provider", "resend");
}

export type DeliveryKind = "delivered" | "bounce" | "complaint";

/** Entrega, devolução ou reclamação de um e-mail enviado (Resend ou SES): status, supressão e evento. */
export async function applyDeliveryEvent(
  accountId: string,
  providerId: string,
  kind: DeliveryKind,
  detail: string | null,
  source: "resend" | "ses",
): Promise<boolean> {
  const db = admin();
  const { data: m } = await db
    .from("email_messages")
    .select("id, account_id, contact_id, to_email, status, campaign_id")
    .eq("provider_id", providerId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!m) return false;
  const now = new Date().toISOString();
  if (kind === "delivered") {
    await db
      .from("email_messages")
      .update(
        m.status === "sent" ? { status: "delivered", delivered_at: now } : { delivered_at: now },
      )
      .eq("id", m.id);
    await db
      .from("email_events")
      .insert({ account_id: accountId, email_message_id: m.id, type: "delivered" });
    return true;
  }
  await db
    .from("email_messages")
    .update(
      kind === "bounce"
        ? { status: "bounced", bounced_at: now, error: detail?.slice(0, 300) ?? "bounce" }
        : { status: "complained" },
    )
    .eq("id", m.id);
  await db.from("suppressions").upsert(
    {
      account_id: accountId,
      channel: "email",
      address: m.to_email.toLowerCase(),
      reason: kind,
      source,
    },
    { onConflict: "account_id,channel,address", ignoreDuplicates: true },
  );
  await db
    .from("email_events")
    .insert({ account_id: accountId, email_message_id: m.id, type: kind });
  if (kind === "bounce")
    await emit(accountId, "email.bounced", m.id, {
      contact_id: m.contact_id,
      campaign_id: m.campaign_id,
    });
  return true;
}

export async function handleResendWebhook(
  accountId: string,
  headers: Headers,
  body: string,
): Promise<{ status: number; message: string }> {
  if (!UUID.test(accountId)) return { status: 400, message: "conta inválida" };
  const it = await getIntegration(accountId, "resend");
  const secret = it?.secrets["webhook_secret"];
  if (!secret) {
    await integrationError(
      accountId,
      "Webhook do Resend recebido, mas o segredo do webhook não está salvo: entrega, bounce e reclamação não estão sendo registrados.",
    );
    return { status: 412, message: "segredo do webhook não configurado" };
  }
  if (!verifySvix(secret, headers, body)) {
    await integrationError(
      accountId,
      "Webhook do Resend com assinatura inválida: confira o segredo salvo.",
    );
    return { status: 401, message: "assinatura inválida" };
  }
  const evt = JSON.parse(body) as {
    type?: string;
    data?: {
      email_id?: string;
      tags?: Record<string, string> | { name: string; value: string }[];
      bounce?: { message?: string };
    };
  };
  const providerId = evt.data?.email_id;
  if (!providerId) return { status: 200, message: "sem email_id" };
  const kind =
    evt.type === "email.delivered"
      ? "delivered"
      : evt.type === "email.bounced"
        ? "bounce"
        : evt.type === "email.complained"
          ? "complaint"
          : null;
  if (kind)
    await applyDeliveryEvent(
      accountId,
      providerId,
      kind,
      evt.data?.bounce?.message ?? null,
      "resend",
    );
  if (it.status === "error")
    await admin()
      .from("account_integrations")
      .update({ status: "connected", last_error: null })
      .eq("account_id", accountId)
      .eq("provider", "resend");
  return { status: 200, message: "ok" };
}

// ── e-mail recebido: vira conversa na inbox ────────────────────────────────────
export interface InboundMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string | null;
}

export function parseAddress(raw: string): { email: string; name: string | null } {
  const m = String(raw ?? "").match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { email: m[2]!.trim().toLowerCase(), name: m[1]!.trim() || null };
  return {
    email: String(raw ?? "")
      .trim()
      .toLowerCase(),
    name: null,
  };
}

// Tira o histórico citado ("Em ... escreveu:") para a inbox mostrar só a resposta nova.
export function stripQuoted(text: string): string {
  const lines = String(text ?? "")
    .replace(/\r/g, "")
    .split("\n");
  const cut = lines.findIndex(
    (l) =>
      /^(Em .+escreveu:|On .+wrote:|-{2,}\s*Original Message|De: .+)$/i.test(l.trim()) ||
      l.startsWith(">"),
  );
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim();
}

export async function emailChannel(accountId: string) {
  const db = admin();
  const { data: ch } = await db
    .from("channels")
    .select("id, webhook_token, handle")
    .eq("account_id", accountId)
    .eq("provider", "email")
    .maybeSingle();
  if (ch) return ch;
  const { data, error } = await db
    .from("channels")
    .insert({
      account_id: accountId,
      provider: "email",
      platform: "email",
      name: "E-mail",
      status: "connected",
      external_id: `email:${accountId}`,
      is_shared: true,
    })
    .select("id, webhook_token, handle")
    .single();
  if (error) throw new Error(`canal de e-mail: ${error.message}`);
  return data;
}

export async function handleInbound(
  accountId: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; message: string }> {
  if (!UUID.test(accountId)) return { status: 400, message: "conta inválida" };
  const db = admin();
  const ch = await emailChannel(accountId);
  const a = Buffer.from(token ?? "");
  const b = Buffer.from(ch.webhook_token);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return { status: 401, message: "token inválido" };

  const data = (
    payload["data"] && typeof payload["data"] === "object" ? payload["data"] : payload
  ) as Record<string, unknown>;
  let mail = {
    from: String(data["from"] ?? ""),
    to: Array.isArray(data["to"])
      ? String((data["to"] as unknown[])[0] ?? "")
      : String(data["to"] ?? ""),
    subject: String(data["subject"] ?? "(sem assunto)"),
    text: String(data["text"] ?? ""),
    messageId:
      (data["message_id"] as string | undefined) ??
      (data["email_id"] as string | undefined) ??
      null,
  };
  if (!mail.text && typeof data["email_id"] === "string") {
    const it = await getIntegration(accountId, "resend");
    const full = it?.secrets["api_key"]
      ? await resendReceived(it.secrets["api_key"], data["email_id"] as string)
      : null;
    if (full)
      mail = {
        ...mail,
        from: full.from ?? mail.from,
        subject: full.subject ?? mail.subject,
        text: full.text ?? (full.html ? full.html.replace(/<[^>]+>/g, " ") : ""),
        messageId: full.message_id ?? mail.messageId,
      };
  }
  const { email, name } = parseAddress(mail.from);
  if (!email.includes("@")) return { status: 422, message: "remetente inválido" };

  const { data: existing } = await db
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  let contactId = existing?.id ?? null;
  if (!contactId) {
    const { data: created, error } = await db
      .from("contacts")
      .insert({
        account_id: accountId,
        name: name ?? email.split("@")[0] ?? null,
        email,
        source: "email",
      })
      .select("id")
      .single();
    if (error) throw new Error(`contato: ${error.message}`);
    contactId = created.id;
  }
  await db.from("contact_identities").upsert(
    {
      account_id: accountId,
      contact_id: contactId,
      platform: "email",
      handle: email,
      display_name: name,
    },
    { onConflict: "account_id,platform,handle", ignoreDuplicates: true },
  );
  const { data: conv } = await db
    .from("conversations")
    .upsert(
      {
        account_id: accountId,
        channel_id: ch.id,
        contact_id: contactId,
        external_thread_id: email,
        title: name ?? email,
      },
      { onConflict: "channel_id,external_thread_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (!conv) throw new Error("conversa de e-mail não criada");
  const body = stripQuoted(mail.text) || mail.text || "(e-mail sem texto)";
  const { error: msgErr } = await db.from("messages").insert({
    account_id: accountId,
    conversation_id: conv.id,
    direction: "in",
    sender_type: "contact",
    sender_name: name,
    sender_handle: email,
    type: "text",
    body: `${mail.subject ? `**${mail.subject}**\n` : ""}${body}`.slice(0, 20000),
    external_id: mail.messageId,
    status: "received",
    metadata: {
      email: {
        subject: mail.subject,
        message_id: mail.messageId,
        to: mail.to,
        // resposta automática / ausência / devolução: a IA não responde robô
        auto: isAutomatedEmail(email, mail.subject),
      },
    },
  });
  if (msgErr && msgErr.code !== "23505") throw new Error(`mensagem: ${msgErr.message}`);
  return { status: 200, message: "ok" };
}
