import { BRAND } from "@/lib/brand";
// Ações autenticadas do módulo de e-mail (chamadas por /api/email).
import {
  HttpError,
  admin,
  appBaseUrl,
  isUuid,
  rateLimit,
  type Caller,
} from "@/backend/http.server";
import { NotConfigured } from "@/backend/integrations.server";
import { BOUNCE_MAX, BOUNCE_WARN, SPAM_MAX, SPAM_WARN, healthLevel } from "@/features/email/dns";
import { contactVars, escapeHtml, plainToHtml, type EmailVars } from "@/features/email/render";
import { isSegmentFilter } from "@/features/segments/rules";

import { enqueueCampaignBatch, estimateAudience } from "./campaign.server";
import { getSender, isValidEmail, sellerName, sendEmail } from "./core.server";
import { checkDomain } from "./dns.server";
import { hasEmailProvider } from "./transport.server";
import { emailChannel } from "./events.server";

async function senderOrExplain(accountId: string, fromName?: string | null) {
  try {
    return await getSender(accountId, fromName);
  } catch (err) {
    if (err instanceof NotConfigured)
      throw new HttpError(
        412,
        "Configure o Resend ou o Amazon SES em Ajustes › Integrações para enviar e-mails.",
        "not_configured",
      );
    throw err;
  }
}

async function loadContact(caller: Caller, contactId: string) {
  const { data: c } = await admin()
    .from("contacts")
    .select("id, account_id, name, email, phone, company, job_title, city, custom, owner_user_id")
    .eq("id", contactId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!c) throw new HttpError(404, "Contato não encontrado", "not_found");
  if (caller.role === "seller" && c.owner_user_id && c.owner_user_id !== caller.userId)
    throw new HttpError(403, "Contato de outro vendedor", "forbidden");
  return c;
}

/** Negócio informado no corpo: só se for desta conta (S10). Sem negócio, null. */
async function ownDealId(caller: Caller, dealId: unknown): Promise<string | null> {
  if (dealId === undefined || dealId === null || dealId === "") return null;
  if (!isUuid(dealId)) throw new HttpError(400, "Negócio inválido", "bad_deal");
  const { data } = await admin()
    .from("deals")
    .select("id")
    .eq("id", dealId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Negócio não encontrado", "not_found");
  return data.id;
}

export async function sendOne(
  caller: Caller,
  b: { to?: string; subject?: string; text?: string; contactId?: string; dealId?: string },
) {
  const subject = String(b.subject ?? "").trim();
  const text = String(b.text ?? "").trim();
  if (!subject || subject.length > 200)
    throw new HttpError(422, "Informe um assunto (até 200 caracteres)", "invalid");
  if (!text) throw new HttpError(422, "Escreva a mensagem", "invalid");
  let to = String(b.to ?? "").trim();
  let vars: EmailVars = {};
  const me = await sellerName(caller.userId);
  if (b.contactId) {
    if (!isUuid(b.contactId)) throw new HttpError(400, "Contato inválido", "bad_contact");
    const c = await loadContact(caller, b.contactId);
    to = to || c.email || "";
    vars = contactVars(c, me);
  }
  if (!isValidEmail(to)) throw new HttpError(422, "E-mail do destinatário inválido", "invalid");
  // E-mail 1:1 para endereço livre: teto por pessoa (S12).
  await rateLimit(
    `email:1to1:${caller.userId}`,
    60,
    3600,
    "Muitos e-mails em pouco tempo. Espere uns minutos.",
  );
  const dealId = await ownDealId(caller, b.dealId);
  const base = await senderOrExplain(caller.accountId);
  // 1:1 sai com o nome do vendedor ("Ana | Empresa") e a resposta volta para o e-mail dele.
  const fromEmail = base.from.match(/<([^>]+)>/)?.[1] ?? base.from;
  const sender = me
    ? {
        ...base,
        from: `${me.replace(/[<>"|]/g, "")} | ${base.brand.replace(/[<>"]/g, "")} <${fromEmail}>`,
      }
    : base;
  const r = await sendEmail(
    {
      accountId: caller.accountId,
      kind: "one_to_one",
      category: "transactional",
      to,
      subject,
      html: plainToHtml(text, sender.signature),
      vars,
      contactId: b.contactId ?? null,
      dealId,
      userId: caller.userId,
      replyTo: caller.email,
    },
    sender,
  );
  if (r.status !== "sent") throw new HttpError(422, r.reason ?? "E-mail não enviado", "not_sent");
  if (b.contactId) {
    await admin()
      .from("activities")
      .insert({
        account_id: caller.accountId,
        contact_id: b.contactId,
        deal_id: dealId,
        type: "email",
        title: `E-mail: ${subject}`,
        body: text.slice(0, 2000),
        user_id: caller.userId,
        done_at: new Date().toISOString(),
      });
  }
  return { ok: true, id: r.id };
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // o Resend aceita até 40 MB por e-mail, já em base64

interface ReplyAttachment {
  path?: string;
  name?: string;
  mime?: string;
}

/** Baixa o anexo do bucket privado, só se estiver na pasta da conversa desta conta. */
async function loadAttachment(accountId: string, conversationId: string, a: ReplyAttachment) {
  const path = String(a.path ?? "");
  if (!path.startsWith(`${accountId}/${conversationId}/`) || path.includes(".."))
    throw new HttpError(400, "Anexo inválido", "bad_attachment");
  const { data, error } = await admin().storage.from("media").download(path);
  if (error || !data) throw new HttpError(404, "Anexo não encontrado", "attachment_missing");
  if (data.size > MAX_ATTACHMENT_BYTES)
    throw new HttpError(413, "Anexo maior que 20 MB", "attachment_too_big");
  const filename = (String(a.name ?? "").trim() || path.split("/").pop()!).slice(0, 180);
  const mime = String(a.mime ?? "").slice(0, 120) || "application/octet-stream";
  return {
    path,
    filename,
    mime,
    content: Buffer.from(await data.arrayBuffer()).toString("base64"),
  };
}

export async function replyConversation(
  caller: Caller,
  b: { conversationId?: string; text?: string; attachment?: ReplyAttachment | null },
) {
  if (!isUuid(b.conversationId)) throw new HttpError(400, "Conversa inválida", "bad_conversation");
  const text = String(b.text ?? "").trim();
  if (!text && !b.attachment) throw new HttpError(422, "Escreva a resposta", "invalid");
  const db = admin();
  const { data: conv } = await db
    .from("conversations")
    .select("id, account_id, contact_id, assignee_user_id, channels(provider, config)")
    .eq("id", b.conversationId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!conv) throw new HttpError(404, "Conversa não encontrada", "not_found");
  if ((conv.channels as unknown as { provider: string } | null)?.provider !== "email")
    throw new HttpError(400, "Esta conversa não é de e-mail", "not_email");
  if (!conv.contact_id) throw new HttpError(422, "Conversa sem contato", "no_contact");
  const c = await loadContact(caller, conv.contact_id);
  if (!isValidEmail(c.email))
    throw new HttpError(422, "O contato não tem e-mail válido", "invalid");
  const { data: last } = await db
    .from("messages")
    .select("external_id, metadata")
    .eq("conversation_id", conv.id)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastSubject = (
    (last?.metadata as Record<string, Record<string, string>> | null)?.["email"]?.["subject"] ?? ""
  ).trim();
  const subject = lastSubject
    ? /^re:/i.test(lastSubject)
      ? lastSubject
      : `Re: ${lastSubject}`
    : "Re: sua mensagem";
  // Gmail/Outlook do vendedor conectado pela Composio: a resposta sai pela própria caixa dele
  const chConfig = ((conv.channels as unknown as { config?: Record<string, unknown> } | null)
    ?.config ?? {}) as Record<string, unknown>;
  if (chConfig["via"] === "composio") {
    const { replyViaComposio } = await import("@/backend/agents/composio-reply.server");
    return replyViaComposio({
      accountId: caller.accountId,
      userId: caller.userId,
      senderName: await sellerName(caller.userId),
      conversationId: conv.id,
      toolkit: String(chConfig["toolkit"] ?? ""),
      to: c.email!,
      subject,
      text,
      hasAttachment: !!b.attachment,
      last:
        (last?.metadata as { email?: { thread_id?: string; message_id?: string } } | null)?.email ??
        null,
    });
  }
  const file = b.attachment ? await loadAttachment(caller.accountId, conv.id, b.attachment) : null;
  const me = await sellerName(caller.userId);
  const sender = await senderOrExplain(caller.accountId);
  const headers: Record<string, string> = last?.external_id
    ? { "In-Reply-To": last.external_id, References: last.external_id }
    : {};
  const { data: msg } = await db
    .from("messages")
    .insert({
      account_id: caller.accountId,
      conversation_id: conv.id,
      direction: "out",
      sender_type: "user",
      sender_user_id: caller.userId,
      sender_name: me,
      type: file ? (file.mime.startsWith("image/") ? "image" : "document") : "text",
      body: text || null,
      status: "queued",
      media_url: file?.path ?? null,
      media_mime: file?.mime ?? null,
      media_name: file?.filename ?? null,
      metadata: { email: { subject } },
    })
    .select("id")
    .single();
  const r = await sendEmail(
    {
      accountId: caller.accountId,
      kind: "reply",
      category: "transactional",
      to: c.email!,
      subject,
      html: plainToHtml(text || `Segue em anexo: ${file?.filename ?? ""}`, sender.signature),
      contactId: c.id,
      conversationId: conv.id,
      userId: caller.userId,
      replyTo: caller.email,
      headers,
      ...(file
        ? {
            attachments: [
              { filename: file.filename, content: file.content, content_type: file.mime },
            ],
          }
        : {}),
    },
    sender,
  );
  if (msg)
    await db
      .from("messages")
      .update({
        status: r.status === "sent" ? "sent" : "failed",
        error: r.status === "sent" ? null : (r.reason ?? "falha"),
      })
      .eq("id", msg.id);
  if (r.status !== "sent")
    throw new HttpError(422, r.reason ?? "Resposta não enviada", "provider_error");
  return { ok: true, messageId: msg?.id ?? null };
}

export async function audience(caller: Caller, b: { segmentId?: string | null; filter?: unknown }) {
  let filter = isSegmentFilter(b.filter) ? b.filter : null;
  if (!filter && b.segmentId && isUuid(b.segmentId)) {
    const { data } = await admin()
      .from("segments")
      .select("filter")
      .eq("id", b.segmentId)
      .eq("account_id", caller.accountId)
      .maybeSingle();
    filter = isSegmentFilter(data?.filter) ? data.filter : null;
  }
  return { count: await estimateAudience(caller.accountId, filter) };
}

async function loadCampaign(caller: Caller, id: string | undefined) {
  if (!isUuid(id)) throw new HttpError(400, "Campanha inválida", "bad_campaign");
  const { data: c } = await admin()
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!c) throw new HttpError(404, "Campanha não encontrada", "not_found");
  return c;
}

export async function campaignTest(caller: Caller, b: { campaignId?: string; to?: string }) {
  const c = await loadCampaign(caller, b.campaignId);
  if (!c.subject.trim() || !c.html)
    throw new HttpError(422, "Preencha assunto e conteúdo antes do teste", "incomplete");
  const to = String(b.to || caller.email || "").trim();
  if (!isValidEmail(to)) throw new HttpError(422, "E-mail de teste inválido", "invalid");
  const me = await sellerName(caller.userId);
  // Teste usa dados de exemplo: nunca dispara para a base (bug 8 da EasyCover).
  const sample: EmailVars = {
    nome: me ?? "Maria Silva",
    primeiro_nome: (me ?? "Maria").split(" ")[0],
    email: to,
    empresa: "Empresa Exemplo",
    cargo: "Diretora",
    cidade: "São Paulo",
    vendedor: me ?? "Seu vendedor",
  };
  const r = await sendEmail({
    accountId: caller.accountId,
    kind: "test",
    // marketing para o teste sair igual ao envio real (rodapé e descadastro assinado)
    category: "marketing",
    to,
    subject: `[Teste] ${c.subject}`,
    html: c.html,
    vars: new Proxy(sample, { get: (t, k: string) => t[k] ?? `[${k}]` }),
    userId: caller.userId,
    campaignId: null,
  });
  if (r.status !== "sent") throw new HttpError(422, r.reason ?? "Teste não enviado", "not_sent");
  await admin()
    .from("email_campaigns")
    .update({ tested_at: new Date().toISOString(), test_sent_to: to })
    .eq("id", c.id);
  return { ok: true, to };
}

export async function campaignStart(
  caller: Caller,
  b: { campaignId?: string; scheduledAt?: string | null },
) {
  const c = await loadCampaign(caller, b.campaignId);
  if (!["draft", "paused", "scheduled"].includes(c.status))
    throw new HttpError(409, "A campanha já foi disparada", "bad_status");
  if (!c.tested_at)
    throw new HttpError(422, "Envie um teste para você antes de disparar", "needs_test");
  if (!c.segment_id && !isSegmentFilter(c.segment_filter))
    throw new HttpError(422, "Escolha o público da campanha", "no_audience");
  await senderOrExplain(caller.accountId);
  const when = b.scheduledAt ? new Date(b.scheduledAt) : null;
  if (when && Number.isNaN(when.getTime())) throw new HttpError(400, "Data inválida", "bad_date");
  const future = when && when.getTime() > Date.now() + 60_000;
  const filter = isSegmentFilter(c.segment_filter) ? c.segment_filter : null;
  const estimate =
    filter || c.segment_id
      ? await audience(caller, { segmentId: c.segment_id, filter })
      : { count: 0 };
  const { error } = await admin()
    .from("email_campaigns")
    .update({
      status: future ? "scheduled" : "sending",
      scheduled_at: future ? when!.toISOString() : null,
      started_at: future ? null : new Date().toISOString(),
      audience_estimate: estimate.count,
      last_error: null,
    })
    .eq("id", c.id);
  if (error) throw new HttpError(422, error.message, "start");
  await enqueueCampaignBatch(
    caller.accountId,
    c.id,
    null,
    future ? when!.toISOString() : undefined,
  );
  await admin().rpc("audit", {
    _account: caller.accountId,
    _action: "campaign.sent",
    _entity: "email_campaign",
    _entity_id: c.id,
    _meta: { audience: estimate.count, scheduled: future ? when!.toISOString() : null },
  });
  return { ok: true, status: future ? "scheduled" : "sending", audience: estimate.count };
}

export async function campaignControl(caller: Caller, id: string | undefined, action: string) {
  const c = await loadCampaign(caller, id);
  const next =
    action === "campaign_pause" ? "paused" : action === "campaign_cancel" ? "canceled" : "sending";
  if (action === "campaign_resume" && c.status !== "paused")
    throw new HttpError(409, "Só retoma campanha pausada", "bad_status");
  if (action === "campaign_pause" && !["sending", "scheduled"].includes(c.status))
    throw new HttpError(409, "Nada para pausar", "bad_status");
  await admin().from("email_campaigns").update({ status: next }).eq("id", c.id);
  if (next === "sending") {
    const { data: last } = await admin()
      .from("email_messages")
      .select("contact_id")
      .eq("campaign_id", c.id)
      .order("contact_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    await enqueueCampaignBatch(caller.accountId, c.id, last?.contact_id ?? null);
  }
  return { ok: true, status: next };
}

export async function domainCheck(caller: Caller, domain: string | undefined) {
  const d = String(domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
    throw new HttpError(400, "Domínio inválido", "bad_domain");
  const r = await checkDomain(d);
  await admin()
    .from("email_domains")
    .upsert(
      {
        account_id: caller.accountId,
        domain: d,
        status: r.ok ? "verified" : "failed",
        records: r as never,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "account_id,domain" },
    );
  return r;
}

export async function sendInvite(caller: Caller, inviteId: string | undefined) {
  if (!isUuid(inviteId)) throw new HttpError(400, "Convite inválido", "bad_invite");
  const db = admin();
  const { data: inv } = await db
    .from("invites")
    .select("id, email, role, token, expires_at, accepted_at")
    .eq("id", inviteId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!inv || inv.accepted_at)
    throw new HttpError(404, "Convite não encontrado ou já aceito", "not_found");
  if (!(await hasEmailProvider(caller.accountId)))
    return { ok: false, sent: false, reason: "not_configured" };
  const sender = await getSender(caller.accountId);
  const me = (await sellerName(caller.userId)) ?? caller.email ?? "Sua equipe";
  const link = `${appBaseUrl()}/convite/${inv.token}`;
  const ROLE: Record<string, string> = {
    admin: "administrador",
    manager: "gestor",
    agent: "atendente",
    seller: "vendedor",
    owner: "dono",
  };
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6fa;font-family:Manrope,-apple-system,Segoe UI,sans-serif"><table role="presentation" width="100%" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="560" style="max-width:560px;background:#fff;border-radius:24px;padding:32px"><tr><td style="color:#001F35"><h1 style="font-size:22px;margin:0 0 12px">Você foi convidado para ${escapeHtml(sender.brand)}</h1><p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 24px">${escapeHtml(me)} chamou você para entrar no Vínculo como ${ROLE[inv.role] ?? inv.role}. Use este e-mail (${escapeHtml(inv.email)}) para criar sua senha.</p><a href="${link}" style="display:inline-block;background:#B9915B;color:#001F35;font-weight:700;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:10px">Aceitar convite</a><p style="font-size:12px;color:#94a3b8;margin:24px 0 0">O link vale até ${new Date(inv.expires_at).toLocaleDateString("pt-BR")}. Se não esperava este convite, ignore.</p></td></tr></table></td></tr></table></body></html>`;
  const r = await sendEmail(
    {
      accountId: caller.accountId,
      kind: "transactional",
      category: "transactional",
      to: inv.email,
      subject: `Convite para ${sender.brand} no ${BRAND.name}`,
      html,
      userId: caller.userId,
    },
    sender,
  );
  if (r.status !== "sent") throw new HttpError(422, r.reason ?? "Convite não enviado", "not_sent");
  return { ok: true, sent: true };
}

export async function setupInfo(caller: Caller) {
  const ch = await emailChannel(caller.accountId);
  const base = appBaseUrl();
  return {
    resendWebhook: `${base}/api/public/resend?a=${caller.accountId}`,
    inboundUrl: `${base}/api/public/email/inbound?a=${caller.accountId}&t=${ch.webhook_token}`,
  };
}

export async function health(caller: Caller) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const db = admin();
  const count = async (statuses: string[] | null) => {
    let q = db
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("account_id", caller.accountId)
      .gte("created_at", since);
    q = statuses
      ? q.in("status", statuses)
      : q.in("status", ["sent", "delivered", "opened", "clicked", "bounced", "complained"]);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [sent, bounced, complained, opened, clicked] = await Promise.all([
    count(null),
    count(["bounced"]),
    count(["complained"]),
    count(["opened", "clicked"]),
    count(["clicked"]),
  ]);
  const rate = (n: number) => (sent ? n / sent : 0);
  return {
    sent,
    bounced,
    complained,
    opened,
    clicked,
    bounceRate: rate(bounced),
    spamRate: rate(complained),
    openRate: rate(opened),
    clickRate: rate(clicked),
    bounceLevel: healthLevel(rate(bounced), BOUNCE_WARN, BOUNCE_MAX),
    spamLevel: healthLevel(rate(complained), SPAM_WARN, SPAM_MAX),
  };
}

/**
 * E-mail marketing escrito pela IA (Opus 5.5 na IA embutida): assunto, prévia e blocos a partir
 * do pedido da pessoa, com o que a empresa vende e a base de conhecimento como fonte. Só propõe:
 * o texto cai no editor para revisar antes de qualquer envio.
 */
export async function composeCampaign(
  caller: Caller,
  b: { brief?: string; tone?: string; link?: string },
) {
  const brief = String(b.brief ?? "")
    .trim()
    .slice(0, 2000);
  if (brief.length < 8)
    throw new HttpError(422, "Conte em uma frase sobre o que é o e-mail", "brief");
  const link = String(b.link ?? "").trim();
  const fallbackUrl = /^https:\/\/[^\s"<>]+$/i.test(link) ? link : null;
  const db = admin();
  const [{ data: acc }, { data: products }] = await Promise.all([
    db.from("accounts").select("name").eq("id", caller.accountId).single(),
    db
      .from("products")
      .select("name, price, description")
      .eq("account_id", caller.accountId)
      .eq("active", true)
      .order("position")
      .limit(20),
  ]);
  const { searchKb } = await import("@/backend/support/kb-search.server");
  const kb = await searchKb(caller.accountId, brief, { limit: 3 }).catch(() => []);
  const { callJson } = await import("@/backend/llm.server");
  const { COMPOSE_SCHEMA, toBlocks } = await import("./compose");
  const tone = ["próximo", "formal", "animado", "direto"].includes(String(b.tone))
    ? String(b.tone)
    : "próximo";
  const system = [
    `Você escreve e-mail marketing em português do Brasil para ${acc?.name ?? "a empresa"}.`,
    `Tom: ${tone}. Frases curtas, uma ideia por parágrafo, nada de caixa alta nem promessa que a empresa não fez.`,
    "Use {{primeiro_nome | Olá}} para chamar a pessoa pelo nome. Não invente preço, prazo nem desconto: só os que estão abaixo.",
    "Estrutura: um título, 2 a 4 parágrafos curtos, um botão com a ação principal (ou nenhum, se não houver link) e fim.",
    "Não escreva descadastro nem rodapé: a plataforma coloca.",
    products?.length
      ? `Catálogo:\n${products.map((p) => `- ${p.name}${p.price !== null ? ` (R$ ${Number(p.price).toFixed(2)})` : ""}${p.description ? `: ${p.description.slice(0, 160)}` : ""}`).join("\n")}`
      : "",
    kb.length
      ? `Base de conhecimento:\n${kb.map((k) => `- ${k.title}: ${k.body_md.slice(0, 600)}`).join("\n")}`
      : "",
    fallbackUrl ? `Link do botão: ${fallbackUrl}` : "Sem link: não ponha botão.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await callJson<Parameters<typeof toBlocks>[0]>(
    caller.accountId,
    "email_compose",
    {
      system,
      messages: [{ role: "user", content: brief }],
      schemaName: "email",
      schema: COMPOSE_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 2500,
    },
    { tier: "reply" },
  );
  return { ...toBlocks(r.data, fallbackUrl), model: r.model };
}
