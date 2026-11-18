// Contrato da API REST v3.1 da Composio (https://docs.composio.dev/reference), sem rede.
// O servidor (composio.server.ts) só faz fetch com estes pedidos e lê com estes leitores.
import { createHmac, timingSafeEqual } from "node:crypto";

import { connectionStatus } from "@/features/agents/catalog";

export const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";

export interface ComposioRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}

export const req = {
  /** Testar a chave: lista 1 toolkit (não custa nada). */
  test: (): ComposioRequest => ({ method: "GET", path: "/toolkits?limit=1" }),
  /** Uma sessão por conta, sem gerenciador de conexão nem sandbox: nosso servidor decide tudo. */
  createSession: (userId: string): ComposioRequest => ({
    method: "POST",
    path: "/tool_router/session",
    body: {
      user_id: userId,
      manage_connections: { enable: false },
      workbench: { enable: false },
    },
  }),
  link: (sessionId: string, toolkit: string, callbackUrl: string): ComposioRequest => ({
    method: "POST",
    path: `/tool_router/session/${encodeURIComponent(sessionId)}/link`,
    body: { toolkit, callback_url: callbackUrl },
  }),
  sessionToolkits: (sessionId: string, toolkits: string[]): ComposioRequest => ({
    method: "GET",
    path: `/tool_router/session/${encodeURIComponent(sessionId)}/toolkits?toolkits=${toolkits.map(encodeURIComponent).join(",")}&limit=50`,
  }),
  connectedAccount: (id: string): ComposioRequest => ({
    method: "GET",
    path: `/connected_accounts/${encodeURIComponent(id)}`,
  }),
  deleteConnectedAccount: (id: string): ComposioRequest => ({
    method: "DELETE",
    path: `/connected_accounts/${encodeURIComponent(id)}`,
  }),
  tools: (toolkit: string, slugs: string[] = []): ComposioRequest => ({
    method: "GET",
    path: slugs.length
      ? `/tools?tool_slugs=${slugs.map(encodeURIComponent).join(",")}&limit=100`
      : `/tools?toolkit_slug=${encodeURIComponent(toolkit)}&important=true&limit=50`,
  }),
  execute: (
    sessionId: string,
    toolSlug: string,
    args: Record<string, unknown>,
  ): ComposioRequest => ({
    method: "POST",
    path: `/tool_router/session/${encodeURIComponent(sessionId)}/execute`,
    body: { tool_slug: toolSlug, arguments: args },
  }),
  upsertTrigger: (
    slug: string,
    userId: string,
    connectedAccountId: string | null,
    config: Record<string, unknown>,
  ): ComposioRequest => ({
    method: "POST",
    path: `/trigger_instances/${encodeURIComponent(slug)}/upsert`,
    body: {
      user_id: userId,
      ...(connectedAccountId ? { connected_account_id: connectedAccountId } : {}),
      trigger_config: config,
    },
  }),
  webhookSubscriptions: (): ComposioRequest => ({ method: "GET", path: "/webhook_subscriptions" }),
  createWebhook: (url: string): ComposioRequest => ({
    method: "POST",
    path: "/webhook_subscriptions",
    body: { webhook_url: url, enabled_events: ["composio.trigger.message"], version: "V3" },
  }),
  updateWebhook: (id: string, url: string): ComposioRequest => ({
    method: "PATCH",
    path: `/webhook_subscriptions/${encodeURIComponent(id)}`,
    body: { webhook_url: url, enabled_events: ["composio.trigger.message"] },
  }),
};

/** Mensagem de erro da Composio em português de operador. */
export function errorMessage(status: number, body: unknown): string {
  const e = (body as { error?: { message?: string; slug?: string } } | null)?.error;
  if (status === 401 || status === 403)
    return "A chave da Composio foi recusada. Confira e cole de novo.";
  if (status === 429) return "A Composio pediu para esperar um pouco (limite de uso).";
  if (e?.slug === "ToolRouterV2_NoActiveConnection")
    return "Este app ainda não foi conectado. Conecte a conta antes de usar.";
  return `Composio ${status}: ${e?.message ?? "erro sem detalhe"}`.slice(0, 300);
}

export function parseSession(body: unknown): { sessionId: string } {
  const id = (body as { session_id?: unknown } | null)?.session_id;
  if (typeof id !== "string" || !id) throw new Error("A Composio não devolveu a sessão");
  return { sessionId: id };
}

export function parseLink(body: unknown): { redirectUrl: string; connectedAccountId: string } {
  const b = (body ?? {}) as { redirect_url?: unknown; connected_account_id?: unknown };
  if (typeof b.redirect_url !== "string" || !/^https:\/\//.test(b.redirect_url))
    throw new Error("A Composio não devolveu o link de conexão");
  return {
    redirectUrl: b.redirect_url,
    connectedAccountId: typeof b.connected_account_id === "string" ? b.connected_account_id : "",
  };
}

export interface ToolkitState {
  slug: string;
  name: string;
  logo: string | null;
  connectedAccountId: string | null;
  status: ReturnType<typeof connectionStatus>;
}

export function parseSessionToolkits(body: unknown): ToolkitState[] {
  const items = ((body as { items?: unknown[] } | null)?.items ?? []) as {
    slug?: string;
    name?: string;
    meta?: { logo?: string };
    connected_account?: { id?: string; status?: string } | null;
  }[];
  return items
    .filter((i) => typeof i.slug === "string")
    .map((i) => ({
      slug: i.slug!,
      name: i.name ?? i.slug!,
      logo: i.meta?.logo ?? null,
      connectedAccountId: i.connected_account?.id ?? null,
      status: i.connected_account
        ? connectionStatus(i.connected_account.status ?? "ACTIVE")
        : "pending",
    }));
}

export function parseConnectedAccount(body: unknown): {
  id: string;
  toolkit: string;
  status: ReturnType<typeof connectionStatus>;
  reason: string | null;
} {
  const b = (body ?? {}) as {
    id?: string;
    toolkit?: { slug?: string };
    status?: string;
    status_reason?: string | null;
  };
  return {
    id: b.id ?? "",
    toolkit: b.toolkit?.slug ?? "",
    status: connectionStatus(b.status),
    reason: b.status_reason ?? null,
  };
}

export interface ToolInfo {
  slug: string;
  name: string;
  description: string;
  toolkit: string;
  input_parameters: Record<string, unknown>;
}

export function parseTools(body: unknown): ToolInfo[] {
  const items = ((body as { items?: unknown[] } | null)?.items ?? []) as {
    slug?: string;
    name?: string;
    description?: string;
    human_description?: string;
    toolkit?: { slug?: string };
    input_parameters?: Record<string, unknown>;
    is_deprecated?: boolean;
  }[];
  return items
    .filter((i) => typeof i.slug === "string" && !i.is_deprecated)
    .map((i) => ({
      slug: i.slug!,
      name: i.name ?? i.slug!,
      description: (i.description ?? i.human_description ?? "").slice(0, 1000),
      toolkit: i.toolkit?.slug ?? "",
      input_parameters: i.input_parameters ?? { type: "object", properties: {} },
    }));
}

export interface ExecuteResult {
  ok: boolean;
  data: unknown;
  error: string | null;
  logId: string | null;
}

/** result_type manda: completed é sucesso; failed e blocked são falha (o erro pode vir vazio). */
export function parseExecute(body: unknown): ExecuteResult {
  const b = (body ?? {}) as {
    result_type?: string;
    data?: unknown;
    error?: string | null;
    message?: string;
    log_id?: string;
  };
  const ok = b.result_type === "completed";
  return {
    ok,
    data: b.data ?? null,
    error: ok
      ? null
      : (b.error ?? b.message ?? `a ação terminou como ${b.result_type ?? "desconhecido"}`),
    logId: b.log_id ?? null,
  };
}

export function parseWebhookSubscription(
  body: unknown,
): { id: string; url: string; secret: string | null } | null {
  const b = (body ?? {}) as { id?: string; webhook_url?: string; secret?: string };
  const item = (body as { items?: (typeof b)[] } | null)?.items?.[0] ?? b;
  if (!item?.id) return null;
  return { id: item.id, url: item.webhook_url ?? "", secret: item.secret ?? null };
}

/**
 * Assinatura do webhook: HMAC-SHA256 de "{webhook-id}.{webhook-timestamp}.{corpo cru}" em base64,
 * no cabeçalho webhook-signature ("v1,<assinatura>", pode vir mais de uma separada por espaço).
 */
export function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest("base64");
  const want = Buffer.from(expected);
  return headers.signature
    .split(" ")
    .map((s) => (s.includes(",") ? s.slice(s.indexOf(",") + 1) : s))
    .some((sig) => {
      const got = Buffer.from(sig);
      return got.length === want.length && timingSafeEqual(got, want);
    });
}

export interface TriggerEvent {
  triggerSlug: string;
  triggerId: string | null;
  userId: string | null;
  connectedAccountId: string | null;
  data: Record<string, unknown>;
  eventId: string | null;
}

/** Envelope V3 (type composio.trigger.message, metadata + data). Outros tipos voltam null. */
export function parseTriggerEvent(body: unknown): TriggerEvent | null {
  const b = (body ?? {}) as {
    id?: string;
    type?: string;
    metadata?: {
      trigger_slug?: string;
      trigger_id?: string;
      user_id?: string;
      connected_account_id?: string;
    };
    data?: Record<string, unknown>;
  };
  if (b.type !== "composio.trigger.message" || !b.metadata?.trigger_slug) return null;
  return {
    triggerSlug: b.metadata.trigger_slug,
    triggerId: b.metadata.trigger_id ?? null,
    userId: b.metadata.user_id ?? null,
    connectedAccountId: b.metadata.connected_account_id ?? null,
    data: b.data ?? {},
    eventId: b.id ?? null,
  };
}

export interface InboundMail {
  fromEmail: string;
  fromName: string | null;
  subject: string;
  text: string;
  messageId: string | null;
  threadId: string | null;
}

function parseAddress(raw: string): { email: string; name: string | null } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { email: m[2]!.trim().toLowerCase(), name: m[1]!.trim() || null };
  return { email: raw.trim().toLowerCase(), name: null };
}

/** Gmail (GMAIL_NEW_GMAIL_MESSAGE) e Outlook (OUTLOOK_MESSAGE_TRIGGER) → e-mail recebido. */
export function mailFromTrigger(ev: TriggerEvent): InboundMail | null {
  const d = ev.data;
  if (ev.triggerSlug === "GMAIL_NEW_GMAIL_MESSAGE") {
    const labels = Array.isArray(d["label_ids"]) ? (d["label_ids"] as unknown[]).map(String) : [];
    if (labels.includes("SENT") || labels.includes("DRAFT")) return null;
    const from = parseAddress(String(d["sender"] ?? ""));
    if (!from.email.includes("@")) return null;
    return {
      fromEmail: from.email,
      fromName: from.name,
      subject: String(d["subject"] ?? "(sem assunto)"),
      text: String(
        d["message_text"] ?? (d["preview"] as { body?: string } | undefined)?.body ?? "",
      ),
      messageId: typeof d["message_id"] === "string" ? (d["message_id"] as string) : null,
      threadId: typeof d["thread_id"] === "string" ? (d["thread_id"] as string) : null,
    };
  }
  if (ev.triggerSlug === "OUTLOOK_MESSAGE_TRIGGER") {
    const fromObj = d["from"] as { emailAddress?: { address?: string; name?: string } } | undefined;
    const email = String(fromObj?.emailAddress?.address ?? d["sender"] ?? "").toLowerCase();
    if (!email.includes("@")) return null;
    const body = d["body"] as { content?: string } | undefined;
    return {
      fromEmail: email,
      fromName: fromObj?.emailAddress?.name ?? null,
      subject: String(d["subject"] ?? "(sem assunto)"),
      text: String(d["bodyPreview"] ?? body?.content ?? "").replace(/<[^>]+>/g, " "),
      messageId: typeof d["id"] === "string" ? (d["id"] as string) : null,
      threadId: typeof d["conversationId"] === "string" ? (d["conversationId"] as string) : null,
    };
  }
  return null;
}

export interface MailReply {
  to: string;
  subject: string;
  text: string;
  /** Gmail: thread_id do e-mail recebido; Outlook: id da mensagem recebida. */
  threadId: string | null;
  messageId: string | null;
}

/**
 * Ação da Composio para responder um e-mail (esquemas conferidos em 27/10/2026):
 * GMAIL_REPLY_TO_THREAD {thread_id, recipient_email, message_body}; GMAIL_SEND_EMAIL
 * {recipient_email, subject, body}; OUTLOOK_REPLY_EMAIL {message_id, comment};
 * OUTLOOK_SEND_EMAIL {to, subject, body}.
 */
export function mailAction(
  toolkit: string,
  m: MailReply,
): { slug: string; args: Record<string, unknown> } | null {
  if (toolkit === "gmail")
    return m.threadId
      ? {
          slug: "GMAIL_REPLY_TO_THREAD",
          args: { thread_id: m.threadId, recipient_email: m.to, message_body: m.text },
        }
      : {
          slug: "GMAIL_SEND_EMAIL",
          args: { recipient_email: m.to, subject: m.subject, body: m.text },
        };
  if (toolkit === "outlook")
    return m.messageId
      ? { slug: "OUTLOOK_REPLY_EMAIL", args: { message_id: m.messageId, comment: m.text } }
      : { slug: "OUTLOOK_SEND_EMAIL", args: { to: m.to, subject: m.subject, body: m.text } };
  return null;
}
