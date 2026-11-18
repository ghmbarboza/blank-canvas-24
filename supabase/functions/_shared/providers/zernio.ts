// Zernio: caixa unificada de DMs (Instagram, Messenger, TikTok, Telegram, X, WhatsApp, Reddit,
// Bluesky, SMS). LinkedIn, Threads e YouTube têm só comentários na Zernio.
// Credencial: integration:<account>:zernio_api_key. Webhook: integration:<account>:zernio_webhook_secret.
import type { NormalizedMessage } from "../ingest.ts";

const BASE = "https://zernio.com/api";

export const ZERNIO_DM_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "telegram",
  "twitter",
  "whatsapp",
  "reddit",
  "bluesky",
  "sms",
] as const;
export const ZERNIO_CONNECT_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "telegram",
  "twitter",
  "linkedin",
  "whatsapp",
  "threads",
  "youtube",
  "reddit",
  "bluesky",
  "googlebusiness",
] as const;
export const ZERNIO_WEBHOOK_EVENTS = [
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "account.connected",
  "account.disconnected",
];

// Plataforma Zernio → plataforma interna (channels.platform).
export function toPlatform(p: string): string {
  const map: Record<string, string> = { twitter: "x", googlebusiness: "google_business" };
  return map[p] ?? p;
}

async function call<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  extra?: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(extra ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!res.ok)
    throw new Error(`Zernio ${res.status}: ${data?.code ?? ""} ${data?.error ?? ""}`.trim());
  return data as T;
}

export interface ZernioAccount {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profileId?: { _id: string } | string;
  isActive?: boolean;
}

export async function listAccounts(apiKey: string) {
  const r = await call<{ accounts?: ZernioAccount[]; data?: ZernioAccount[] }>(
    apiKey,
    "GET",
    "/v1/accounts?limit=100",
  );
  return r.accounts ?? r.data ?? [];
}

export async function defaultProfileId(apiKey: string) {
  const r = await call<{ profiles?: Array<{ _id: string; isDefault?: boolean }> }>(
    apiKey,
    "GET",
    "/v1/profiles",
  );
  const list = r.profiles ?? [];
  return (list.find((p) => p.isDefault) ?? list[0])?._id ?? null;
}

export async function connectUrl(
  apiKey: string,
  platform: string,
  profileId: string,
  redirectUrl: string,
) {
  const qs = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const r = await call<{ authUrl: string }>(
    apiKey,
    "GET",
    `/v1/connect/${encodeURIComponent(platform)}?${qs}`,
  );
  return r.authUrl;
}

export async function registerWebhook(apiKey: string, url: string, secret: string) {
  return await call<{ webhook?: { _id: string } }>(apiKey, "POST", "/v1/webhooks/settings", {
    name: "Nexus One",
    url,
    events: ZERNIO_WEBHOOK_EVENTS,
    secret,
  });
}

export async function sendMessage(
  apiKey: string,
  conversationId: string,
  accountId: string,
  payload: {
    text?: string | null;
    attachmentUrl?: string;
    attachmentType?: "image" | "video" | "audio" | "file";
    humanAgentTag?: boolean;
  },
) {
  const body: Record<string, unknown> = { accountId };
  if (payload.text) body.message = payload.text;
  if (payload.attachmentUrl) {
    body.attachmentUrl = payload.attachmentUrl;
    body.attachmentType = payload.attachmentType ?? "file";
  }
  if (payload.humanAgentTag) {
    body.messagingType = "MESSAGE_TAG";
    body.messageTag = "HUMAN_AGENT";
  }
  const r = await call<{ data?: { messageId?: string } }>(
    apiKey,
    "POST",
    `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    body,
    { "Idempotency-Key": crypto.randomUUID() },
  );
  return r.data?.messageId ?? null;
}

export async function markRead(apiKey: string, conversationId: string, accountId: string) {
  await call(apiKey, "POST", `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/read`, {
    accountId,
  }).catch(() => null);
}

// ------------------------------------------------------------------ webhook → normalizado
export interface ZernioEvent {
  id?: string;
  event?: string;
  message?: {
    id?: string;
    conversationId?: string;
    platform?: string;
    platformMessageId?: string;
    direction?: "incoming" | "outgoing";
    text?: string;
    sentAt?: string;
    attachments?: Array<{ type?: string; url?: string; mimeType?: string; filename?: string }>;
    sender?: {
      id?: string;
      name?: string;
      username?: string;
      picture?: string;
      phoneNumber?: string;
    };
    error?: { message?: string };
  };
  conversation?: { id?: string; isGroup?: boolean; title?: string };
  account?: {
    id?: string;
    accountId?: string;
    platform?: string;
    username?: string;
    displayName?: string;
  };
}

export function normalizeMessage(evt: ZernioEvent): NormalizedMessage | null {
  const m = evt.message;
  if (!m) return null;
  const threadId = m.conversationId ?? evt.conversation?.id;
  if (!threadId) return null;
  const att = m.attachments?.[0];
  const type: NormalizedMessage["type"] = !att
    ? "text"
    : att.type === "image"
      ? "image"
      : att.type === "video"
        ? "video"
        : att.type === "audio"
          ? "audio"
          : att.type === "sticker"
            ? "sticker"
            : "document";
  if (!m.text && !att) return null;
  const phone = m.sender?.phoneNumber?.replace(/\D/g, "") || null;
  return {
    externalId: m.platformMessageId ?? m.id ?? null,
    direction: m.direction === "outgoing" ? "out" : "in",
    threadId,
    isGroup: Boolean(evt.conversation?.isGroup),
    groupTitle: evt.conversation?.title ?? null,
    senderHandle: m.sender?.username ?? m.sender?.id ?? null,
    senderName: m.sender?.name ?? m.sender?.username ?? null,
    senderAvatar: m.sender?.picture ?? null,
    contactPhone: phone,
    type,
    body: m.text ?? null,
    media: att?.url ? { url: att.url, mime: att.mimeType, name: att.filename } : null,
    sentAt: m.sentAt ?? null,
  };
}
