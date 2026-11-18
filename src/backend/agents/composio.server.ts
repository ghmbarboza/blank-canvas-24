// Composio no servidor: a chave é do CLIENTE (Vault, integration/composio_api_key). Conexão de
// contas por link (auth gerenciada pela Composio), catálogo de ações, execução com log e gatilho
// de e-mail novo virando conversa de e-mail.
import { admin, appBaseUrl, HttpError } from "@/backend/http.server";
import {
  accountFromComposioUser,
  composioToolkit,
  composioUserId,
} from "@/features/agents/catalog";

import {
  COMPOSIO_BASE,
  errorMessage,
  mailAction,
  mailFromTrigger,
  parseConnectedAccount,
  parseExecute,
  parseLink,
  parseSession,
  parseSessionToolkits,
  parseTools,
  parseTriggerEvent,
  parseWebhookSubscription,
  req,
  verifyWebhook,
  type ComposioRequest,
  type MailReply,
  type ExecuteResult,
  type ToolInfo,
} from "./composio";

export const COMPOSIO_KEY = "composio_api_key";
export const COMPOSIO_WEBHOOK_SECRET = "composio_webhook_secret";

async function secret(accountId: string, key: string): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: key,
  });
  return typeof data === "string" && data ? data : null;
}

export async function composioKey(accountId: string): Promise<string> {
  const k = await secret(accountId, COMPOSIO_KEY);
  if (!k)
    throw new HttpError(
      409,
      "Cole a chave da Composio em Equipe de IA › Ferramentas conectadas.",
      "not_configured",
    );
  return k;
}

export async function call(apiKey: string, r: ComposioRequest): Promise<unknown> {
  const res = await fetch(`${COMPOSIO_BASE}${r.path}`, {
    method: r.method,
    headers: { "x-api-key": apiKey, "content-type": "application/json" },
    ...(r.body ? { body: JSON.stringify(r.body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok)
    throw new HttpError(res.status === 401 ? 400 : 502, errorMessage(res.status, body), "composio");
  return body;
}

async function saveSettings(accountId: string, patch: Record<string, unknown>) {
  await admin()
    .from("composio_settings")
    .upsert(
      {
        account_id: accountId,
        user_id: composioUserId(accountId),
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
}

/** Guarda a chave do cliente no Vault e testa na hora. */
export async function saveKey(accountId: string, apiKey: string): Promise<string> {
  const clean = apiKey.trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(clean))
    throw new HttpError(
      400,
      "Essa chave não parece da Composio. Copie de novo do painel.",
      "bad_key",
    );
  await call(clean, req.test());
  const { error } = await admin().rpc("secret_set", {
    _account: accountId,
    _scope: "integration",
    _scope_id: accountId,
    _key: COMPOSIO_KEY,
    _value: clean,
  });
  if (error) throw new HttpError(500, "Não deu para guardar a chave", "secret");
  await saveSettings(accountId, {
    status: "connected",
    last_error: null,
    tested_at: new Date().toISOString(),
    session_id: null,
  });
  return "Chave aceita pela Composio.";
}

export async function testKey(accountId: string): Promise<string> {
  const key = await composioKey(accountId);
  try {
    await call(key, req.test());
    await saveSettings(accountId, {
      status: "connected",
      last_error: null,
      tested_at: new Date().toISOString(),
    });
    return "Conexão com a Composio funcionando.";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await saveSettings(accountId, {
      status: "error",
      last_error: msg.slice(0, 300),
      tested_at: new Date().toISOString(),
    });
    throw err;
  }
}

/** Uma sessão por conta, criada na primeira necessidade e guardada. */
export async function ensureSession(accountId: string, apiKey: string): Promise<string> {
  const { data } = await admin()
    .from("composio_settings")
    .select("session_id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (data?.session_id) return data.session_id;
  const { sessionId } = parseSession(
    await call(apiKey, req.createSession(composioUserId(accountId))),
  );
  await saveSettings(accountId, { session_id: sessionId });
  return sessionId;
}

export async function connectLink(
  accountId: string,
  userId: string,
  toolkit: string,
): Promise<{ url: string }> {
  if (!composioToolkit(toolkit)) throw new HttpError(400, "App não suportado", "bad_toolkit");
  const key = await composioKey(accountId);
  const session = await ensureSession(accountId, key);
  const cb = `${appBaseUrl()}/equipe-ia/ferramentas?conectado=${encodeURIComponent(toolkit)}`;
  const link = parseLink(await call(key, req.link(session, toolkit, cb)));
  await admin()
    .from("composio_connections")
    .upsert(
      {
        account_id: accountId,
        toolkit,
        connected_account_id: link.connectedAccountId || null,
        status: "pending",
        connected_by: userId,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,toolkit" },
    );
  return { url: link.redirectUrl };
}

/** Confere na Composio o estado de cada conexão e, no e-mail, liga o gatilho de mensagem nova. */
export async function refreshConnections(
  accountId: string,
): Promise<{ toolkit: string; status: string }[]> {
  const key = await composioKey(accountId);
  const db = admin();
  const { data: rows } = await db
    .from("composio_connections")
    .select("*")
    .eq("account_id", accountId);
  const out: { toolkit: string; status: string }[] = [];
  for (const row of rows ?? []) {
    let status = row.status;
    let reason: string | null = null;
    if (row.connected_account_id) {
      try {
        const ca = parseConnectedAccount(
          await call(key, req.connectedAccount(row.connected_account_id)),
        );
        status = ca.status;
        reason = ca.reason;
      } catch (err) {
        reason = err instanceof Error ? err.message : String(err);
      }
    }
    let trigger = row.trigger_id;
    let channelId = row.channel_id;
    const def = composioToolkit(row.toolkit);
    if (status === "active" && def?.inboxTrigger && !trigger) {
      try {
        channelId = await ensureMailChannel(accountId, row.toolkit, row.connected_account_id ?? "");
        await ensureWebhook(accountId, key);
        const t = (await call(
          key,
          req.upsertTrigger(def.inboxTrigger, composioUserId(accountId), row.connected_account_id, {
            ...(row.toolkit === "gmail" ? { labelIds: "INBOX", interval: 1 } : {}),
          }),
        )) as { trigger_id?: string; id?: string };
        trigger = t.trigger_id ?? t.id ?? "ativo";
      } catch (err) {
        reason = `Gatilho de e-mail: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    await db
      .from("composio_connections")
      .update({
        status,
        last_error: reason,
        trigger_id: trigger,
        channel_id: channelId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    out.push({ toolkit: row.toolkit, status });
  }
  return out;
}

export async function disconnect(accountId: string, toolkit: string) {
  const db = admin();
  const { data: row } = await db
    .from("composio_connections")
    .select("id, connected_account_id")
    .eq("account_id", accountId)
    .eq("toolkit", toolkit)
    .maybeSingle();
  if (!row) return;
  if (row.connected_account_id) {
    const key = await composioKey(accountId);
    await call(key, req.deleteConnectedAccount(row.connected_account_id)).catch(() => null);
  }
  await db.from("composio_connections").delete().eq("id", row.id);
  await db
    .from("agent_tools")
    .delete()
    .eq("account_id", accountId)
    .eq("kind", "composio")
    .like("slug", `${toolkit.toUpperCase()}_%`);
}

export async function listTools(accountId: string, toolkit: string): Promise<ToolInfo[]> {
  const key = await composioKey(accountId);
  const def = composioToolkit(toolkit);
  const suggested = def?.suggested.map((s) => s.slug) ?? [];
  const [sug, important] = await Promise.all([
    suggested.length
      ? call(key, req.tools(toolkit, suggested)).then(parseTools)
      : Promise.resolve([]),
    call(key, req.tools(toolkit)).then(parseTools),
  ]);
  const seen = new Set<string>();
  return [...sug, ...important].filter((t) =>
    seen.has(t.slug) ? false : (seen.add(t.slug), true),
  );
}

export async function executeAction(
  accountId: string,
  toolSlug: string,
  args: Record<string, unknown>,
): Promise<ExecuteResult> {
  const key = await composioKey(accountId);
  const session = await ensureSession(accountId, key);
  return parseExecute(await call(key, req.execute(session, toolSlug, args)));
}

// ───────────────────────── gatilho: e-mail novo vira conversa ─────────────────────────
async function ensureWebhook(accountId: string, apiKey: string) {
  if (await secret(accountId, COMPOSIO_WEBHOOK_SECRET)) return;
  const url = `${appBaseUrl()}/api/public/composio`;
  let sub = parseWebhookSubscription(await call(apiKey, req.webhookSubscriptions()));
  if (!sub) sub = parseWebhookSubscription(await call(apiKey, req.createWebhook(url)));
  else if (sub.url !== url)
    sub = parseWebhookSubscription(await call(apiKey, req.updateWebhook(sub.id, url)));
  if (!sub?.secret)
    throw new Error(
      "A Composio não devolveu o segredo do webhook; gire o segredo no painel dela e tente de novo",
    );
  await admin().rpc("secret_set", {
    _account: accountId,
    _scope: "integration",
    _scope_id: accountId,
    _key: COMPOSIO_WEBHOOK_SECRET,
    _value: sub.secret,
  });
  await saveSettings(accountId, { webhook_subscription_id: sub.id });
}

async function ensureMailChannel(accountId: string, toolkit: string, connectedAccountId: string) {
  const db = admin();
  const externalId = `composio:${toolkit}:${connectedAccountId}`;
  const { data: existing } = await db
    .from("channels")
    .select("id")
    .eq("provider", "email")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db
    .from("channels")
    .insert({
      account_id: accountId,
      name: toolkit === "gmail" ? "Gmail (Composio)" : "Outlook (Composio)",
      provider: "email",
      platform: "email",
      external_id: externalId,
      status: "connected",
      config: { via: "composio", toolkit, connected_account_id: connectedAccountId },
    })
    .select("id")
    .single();
  if (error) throw new Error(`canal de e-mail: ${error.message}`);
  return data.id;
}

/** Webhook público da Composio: confere assinatura da conta e grava o e-mail como conversa. */
export async function handleComposioWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
): Promise<{ status: number; message: string }> {
  // Sem assinatura não há conversa: 401 antes de olhar o corpo (S8).
  if (!headers.id || !headers.timestamp || !headers.signature)
    return { status: 401, message: "assinatura ausente" };
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, message: "corpo inválido" };
  }
  const ev = parseTriggerEvent(body);
  // Assinado, mas sem conta da Central de CS para conferir: não diz nada além de "não reconhecido".
  const accountId = ev ? accountFromComposioUser(ev.userId) : null;
  if (!ev || !accountId) return { status: 401, message: "assinatura inválida" };
  const s = await secret(accountId, COMPOSIO_WEBHOOK_SECRET);
  if (!s || !verifyWebhook(s, headers, rawBody))
    return { status: 401, message: "assinatura inválida" };
  const mail = mailFromTrigger(ev);
  if (!mail) return { status: 200, message: "evento sem e-mail" };
  const db = admin();
  const toolkit = ev.triggerSlug.startsWith("GMAIL") ? "gmail" : "outlook";
  const { data: conn } = await db
    .from("composio_connections")
    .select("channel_id, connected_account_id")
    .eq("account_id", accountId)
    .eq("toolkit", toolkit)
    .maybeSingle();
  const channelId =
    conn?.channel_id ??
    (await ensureMailChannel(
      accountId,
      toolkit,
      ev.connectedAccountId ?? conn?.connected_account_id ?? "",
    ));

  const { data: existing } = await db
    .from("contacts")
    .select("id")
    .eq("account_id", accountId)
    .ilike("email", mail.fromEmail)
    .limit(1)
    .maybeSingle();
  let contactId = existing?.id ?? null;
  if (!contactId) {
    const { data: created, error } = await db
      .from("contacts")
      .insert({
        account_id: accountId,
        name: mail.fromName ?? mail.fromEmail.split("@")[0] ?? null,
        email: mail.fromEmail,
        source: "email",
      })
      .select("id")
      .single();
    if (error) throw new Error(`contato: ${error.message}`);
    contactId = created.id;
  }
  const { data: conv } = await db
    .from("conversations")
    .upsert(
      {
        account_id: accountId,
        channel_id: channelId,
        contact_id: contactId,
        external_thread_id: mail.fromEmail,
        title: mail.fromName ?? mail.fromEmail,
      },
      { onConflict: "channel_id,external_thread_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();
  if (!conv) throw new Error("conversa de e-mail não criada");
  const { error: msgErr } = await db.from("messages").insert({
    account_id: accountId,
    conversation_id: conv.id,
    direction: "in",
    sender_type: "contact",
    sender_name: mail.fromName,
    sender_handle: mail.fromEmail,
    type: "text",
    body: `${mail.subject ? `**${mail.subject}**\n` : ""}${mail.text || "(e-mail sem texto)"}`.slice(
      0,
      20000,
    ),
    external_id: mail.messageId ? `composio:${mail.messageId}` : null,
    status: "received",
    metadata: {
      email: {
        subject: mail.subject,
        message_id: mail.messageId,
        thread_id: mail.threadId,
        via: "composio",
        toolkit,
      },
    },
  });
  if (msgErr && msgErr.code !== "23505") throw new Error(`mensagem: ${msgErr.message}`);
  return { status: 200, message: "ok" };
}

/** Envia a resposta de e-mail pelo Gmail/Outlook conectado (IA ou atendente). Lança se falhar. */
export async function sendMailViaComposio(accountId: string, toolkit: string, m: MailReply) {
  const a = mailAction(toolkit, m);
  if (!a)
    throw new HttpError(400, "Este canal de e-mail não é do Gmail nem do Outlook", "bad_toolkit");
  const started = Date.now();
  let r: ExecuteResult;
  try {
    r = await executeAction(accountId, a.slug, a.args);
  } catch (err) {
    // chave ausente ou recusada: a mensagem já diz o que fazer, sobe como está
    if (err instanceof HttpError) throw err;
    r = {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      logId: null,
    };
  }
  await admin()
    .from("agent_tool_calls")
    .insert({
      account_id: accountId,
      kind: "composio",
      tool: a.slug,
      args: { ...a.args, message_body: undefined, body: undefined, comment: undefined } as never,
      ok: r.ok,
      error: r.error?.slice(0, 500) ?? null,
      latency_ms: Date.now() - started,
      external_log_id: r.logId,
    });
  if (!r.ok)
    throw new HttpError(
      502,
      `O ${toolkit === "gmail" ? "Gmail" : "Outlook"} não enviou: ${r.error ?? "sem detalhe"}. Confira a conexão em Equipe de IA › Ferramentas conectadas.`,
      "composio_send",
    );
  return r;
}
