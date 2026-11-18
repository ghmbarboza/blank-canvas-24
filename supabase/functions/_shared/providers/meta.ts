// WhatsApp Cloud API oficial (Meta). Um canal por phone_number_id.
// Segredos do canal: channel:<id>:access_token e channel:<id>:app_secret. Verify token = channels.webhook_token.
import type { NormalizedMessage } from "../ingest.ts";

export const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") ?? "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function graph<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string; code?: number };
  } | null;
  if (!res.ok)
    throw new Error(
      `Meta ${res.status}: ${data?.error?.message ?? "erro"} (${data?.error?.code ?? "-"})`,
    );
  return data as T;
}

export async function verifyPhoneNumber(token: string, phoneNumberId: string) {
  return await graph<{ display_phone_number?: string; verified_name?: string }>(
    token,
    "GET",
    `/${phoneNumberId}?fields=display_phone_number,verified_name`,
  );
}

export async function subscribeApp(token: string, wabaId: string) {
  await graph(token, "POST", `/${wabaId}/subscribed_apps`).catch(() => null);
}

export async function sendText(token: string, phoneNumberId: string, to: string, text: string) {
  const r = await graph<{ messages?: Array<{ id: string }> }>(
    token,
    "POST",
    `/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text, preview_url: true },
    },
  );
  return r.messages?.[0]?.id ?? null;
}

export async function sendMedia(
  token: string,
  phoneNumberId: string,
  to: string,
  media: { url: string; mime: string; name?: string; caption?: string },
) {
  const kind = media.mime.startsWith("image/")
    ? "image"
    : media.mime.startsWith("video/")
      ? "video"
      : media.mime.startsWith("audio/")
        ? "audio"
        : "document";
  const payload: Record<string, unknown> = { link: media.url };
  if (kind !== "audio" && media.caption) payload.caption = media.caption;
  if (kind === "document" && media.name) payload.filename = media.name;
  const r = await graph<{ messages?: Array<{ id: string }> }>(
    token,
    "POST",
    `/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: kind,
      [kind]: payload,
    },
  );
  return r.messages?.[0]?.id ?? null;
}

export async function sendTemplate(
  token: string,
  phoneNumberId: string,
  to: string,
  name: string,
  language: string,
  params: string[],
) {
  const r = await graph<{ messages?: Array<{ id: string }> }>(
    token,
    "POST",
    `/${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: language },
        components: params.length
          ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
          : [],
      },
    },
  );
  return r.messages?.[0]?.id ?? null;
}

export async function listTemplates(token: string, wabaId: string) {
  const r = await graph<{
    data?: Array<{
      name: string;
      language: string;
      status: string;
      category: string;
      components?: unknown[];
    }>;
  }>(
    token,
    "GET",
    `/${wabaId}/message_templates?fields=name,language,status,category,components&limit=100`,
  );
  return r.data ?? [];
}

// URL de download da mídia (expira em 5 min): baixe e guarde já.
export async function mediaDownload(token: string, mediaId: string) {
  const r = await graph<{ url: string; mime_type: string }>(token, "GET", `/${mediaId}`);
  return { url: r.url, mime: r.mime_type, headers: { authorization: `Bearer ${token}` } };
}

// ------------------------------------------------------------------ webhook → normalizado
export interface MetaChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{
    wa_id?: string;
    user_id?: string;
    profile?: { name?: string; username?: string };
  }>;
  messages?: Array<
    Record<string, unknown> & {
      id: string;
      from?: string;
      from_user_id?: string;
      timestamp?: string;
      type: string;
      group_id?: string;
    }
  >;
  statuses?: Array<{
    id: string;
    status: string;
    errors?: Array<{ title?: string; message?: string }>;
  }>;
}

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"];

const PHONE = /^\d{8,15}$/;

// Remetente estável (#19). Com os usernames do WhatsApp (2026) o webhook pode vir só com o id de
// usuário de negócio (BSUID), sem telefone. Telefone, quando vem, continua sendo a chave da conversa
// (não quebra as conversas antigas); sem telefone, a chave é o BSUID e o contato fica sem telefone.
export function inboundSender(
  value: MetaChangeValue,
  m: NonNullable<MetaChangeValue["messages"]>[number],
) {
  const contact =
    value.contacts?.find(
      (c) => (m.from && c.wa_id === m.from) || (m.from_user_id && c.user_id === m.from_user_id),
    ) ?? (value.contacts?.length === 1 ? value.contacts[0] : undefined);
  const phone =
    [m.from, contact?.wa_id].find((v) => typeof v === "string" && PHONE.test(v)) ?? null;
  const userId =
    m.from_user_id ?? contact?.user_id ?? (m.from && !PHONE.test(m.from) ? m.from : null);
  const handle = phone ?? userId;
  const name = contact?.profile?.name ?? contact?.profile?.username ?? null;
  return { phone, userId, handle, name };
}

export function normalizeInbound(
  value: MetaChangeValue,
  m: NonNullable<MetaChangeValue["messages"]>[number],
): { msg: NormalizedMessage; mediaId: string | null } | null {
  const sender = inboundSender(value, m);
  if (!sender.handle) return null;
  const name = sender.name;
  let type: NormalizedMessage["type"] = "text";
  let body: string | null = null;
  let mediaId: string | null = null;
  let mime: string | undefined;
  let fileName: string | undefined;
  if (m.type === "text") body = (m.text as { body?: string })?.body ?? null;
  else if (MEDIA_TYPES.includes(m.type)) {
    type = m.type as NormalizedMessage["type"];
    const media = m[m.type] as {
      id?: string;
      caption?: string;
      mime_type?: string;
      filename?: string;
    };
    mediaId = media?.id ?? null;
    body = media?.caption ?? null;
    mime = media?.mime_type;
    fileName = media?.filename;
  } else if (m.type === "location") {
    type = "location";
    const l = m.location as { latitude?: number; longitude?: number; name?: string };
    body = l?.name ?? `${l?.latitude},${l?.longitude}`;
  } else if (m.type === "button") {
    body = (m.button as { text?: string })?.text ?? null;
  } else if (m.type === "interactive") {
    const i = m.interactive as {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    };
    body = i?.button_reply?.title ?? i?.list_reply?.title ?? null;
  } else if (m.type === "reaction" || m.type === "unsupported" || m.type === "system") {
    return null;
  }
  const isGroup = Boolean(m.group_id);
  return {
    mediaId,
    msg: {
      externalId: m.id,
      direction: "in",
      threadId: isGroup ? String(m.group_id) : sender.handle,
      isGroup,
      senderHandle: sender.handle,
      senderName: name,
      contactPhone: isGroup ? null : sender.phone,
      type,
      body,
      media: mediaId ? { mime, name: fileName } : null,
      replyToExternalId: (m.context as { id?: string } | undefined)?.id ?? null,
      sentAt: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
    },
  };
}
