// Ingestão normalizada: todo provedor converte seu payload em NormalizedMessage e chama
// ingestMessage. Idempotente por (conversation_id, external_id).
import { adminClient } from "./supabase.ts";
import { scheduleClassification } from "./classify-trigger.ts";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "template"
  | "reaction"
  | "system";

export interface ChannelRow {
  id: string;
  account_id: string;
  provider: string;
  platform: string;
  name: string;
  owner_user_id: string | null;
}

export interface NormalizedMessage {
  externalId: string | null;
  direction: "in" | "out";
  threadId: string; // id estável da conversa no provedor
  isGroup: boolean;
  groupTitle?: string | null;
  // remetente (no 1:1 é o contato; no grupo é quem escreveu)
  senderHandle: string | null;
  senderName: string | null;
  senderAvatar?: string | null;
  contactPhone?: string | null;
  type: MessageType;
  body: string | null;
  media?: {
    base64?: string;
    url?: string;
    headers?: Record<string, string>;
    mime?: string;
    name?: string;
  } | null;
  replyToExternalId?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown>;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Guarda a mídia no bucket privado `media`, em <account>/<conversation>/<arquivo>.
async function storeMedia(
  accountId: string,
  conversationId: string,
  media: NonNullable<NormalizedMessage["media"]>,
) {
  let bytes: Uint8Array | null = null;
  let mime = media.mime?.split(";")[0]?.trim() || "application/octet-stream";
  if (media.base64) {
    bytes = decodeBase64(media.base64);
  } else if (media.url) {
    const res = await fetch(media.url, { headers: media.headers ?? {} });
    if (!res.ok) throw new Error(`download de mídia falhou: ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_MEDIA_BYTES) throw new Error("mídia acima de 25 MB");
    bytes = new Uint8Array(await res.arrayBuffer());
    mime = res.headers.get("content-type")?.split(";")[0]?.trim() || mime;
  }
  if (!bytes || bytes.byteLength > MAX_MEDIA_BYTES) return null;
  const ext = EXT_BY_MIME[mime] ?? media.name?.split(".").pop()?.slice(0, 8) ?? "bin";
  const path = `${accountId}/${conversationId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await adminClient()
    .storage.from("media")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`upload de mídia falhou: ${error.message}`);
  return { path, mime };
}

async function findOrCreateContact(channel: ChannelRow, msg: NormalizedMessage) {
  const db = adminClient();
  const handle = msg.senderHandle ?? msg.threadId;
  const { data: identity } = await db
    .from("contact_identities")
    .select("contact_id")
    .eq("account_id", channel.account_id)
    .eq("platform", channel.platform)
    .eq("handle", handle)
    .maybeSingle();
  if (identity) {
    // Completa nome e foto se ainda estão vazios; nunca sobrescreve o que a equipe editou.
    if (msg.senderName || msg.senderAvatar) {
      const { data: c } = await db
        .from("contacts")
        .select("name, avatar_url")
        .eq("id", identity.contact_id)
        .single();
      const patch: Record<string, string> = {};
      if (!c?.name && msg.senderName) patch.name = msg.senderName;
      if (!c?.avatar_url && msg.senderAvatar) patch.avatar_url = msg.senderAvatar;
      if (Object.keys(patch).length)
        await db.from("contacts").update(patch).eq("id", identity.contact_id);
    }
    return identity.contact_id as string;
  }

  // Mesmo telefone já conhecido por outro canal de WhatsApp → mesma pessoa.
  if (msg.contactPhone) {
    const { data: byPhone } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", channel.account_id)
      .eq("phone", msg.contactPhone)
      .limit(1)
      .maybeSingle();
    if (byPhone) {
      await db.from("contact_identities").upsert(
        {
          account_id: channel.account_id,
          contact_id: byPhone.id,
          platform: channel.platform,
          handle,
          display_name: msg.senderName,
        },
        { onConflict: "account_id,platform,handle", ignoreDuplicates: true },
      );
      return byPhone.id as string;
    }
  }

  const { data: created, error } = await db
    .from("contacts")
    .insert({
      account_id: channel.account_id,
      name: msg.senderName,
      avatar_url: msg.senderAvatar ?? null,
      phone: msg.contactPhone ?? null,
      source: channel.platform,
      owner_user_id: channel.owner_user_id,
    })
    .select("id")
    .single();
  if (error) throw new Error(`criar contato: ${error.message}`);
  const { error: idErr } = await db.from("contact_identities").insert({
    account_id: channel.account_id,
    contact_id: created.id,
    platform: channel.platform,
    handle,
    display_name: msg.senderName,
  });
  if (idErr && idErr.code === "23505") {
    // Corrida entre dois webhooks: outro processo criou a identidade. Fica com a dele.
    await db.from("contacts").delete().eq("id", created.id);
    const { data: winner } = await db
      .from("contact_identities")
      .select("contact_id")
      .eq("account_id", channel.account_id)
      .eq("platform", channel.platform)
      .eq("handle", handle)
      .single();
    return winner!.contact_id as string;
  }
  return created.id as string;
}

async function findOrCreateConversation(
  channel: ChannelRow,
  msg: NormalizedMessage,
  contactId: string | null,
) {
  const db = adminClient();
  const { data: existing } = await db
    .from("conversations")
    .select("id, contact_id, title")
    .eq("channel_id", channel.id)
    .eq("external_thread_id", msg.threadId)
    .maybeSingle();
  if (existing) {
    if (msg.isGroup && msg.groupTitle && existing.title !== msg.groupTitle) {
      await db.from("conversations").update({ title: msg.groupTitle }).eq("id", existing.id);
    }
    return existing.id as string;
  }
  const { data, error } = await db
    .from("conversations")
    .upsert(
      {
        account_id: channel.account_id,
        channel_id: channel.id,
        contact_id: msg.isGroup ? null : contactId,
        external_thread_id: msg.threadId,
        is_group: msg.isGroup,
        title: msg.isGroup ? (msg.groupTitle ?? "Grupo") : null,
        assignee_user_id: channel.owner_user_id,
      },
      { onConflict: "channel_id,external_thread_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`criar conversa: ${error.message}`);
  return data.id as string;
}

export interface IngestResult {
  messageId: string | null;
  conversationId: string;
  contactId: string | null;
  duplicate: boolean;
}

export async function ingestMessage(
  channel: ChannelRow,
  msg: NormalizedMessage,
): Promise<IngestResult> {
  const db = adminClient();
  // Mensagem enviada pela própria plataforma volta como eco: só confirma o status.
  if (msg.direction === "out" && msg.externalId) {
    const { data: echo } = await db
      .from("messages")
      .select("id, conversation_id")
      .eq("account_id", channel.account_id)
      .eq("external_id", msg.externalId)
      .maybeSingle();
    if (echo)
      return {
        messageId: echo.id,
        conversationId: echo.conversation_id,
        contactId: null,
        duplicate: true,
      };
  }

  const contactId =
    msg.isGroup && msg.direction === "out" ? null : await findOrCreateContact(channel, msg);
  const conversationId = await findOrCreateConversation(
    channel,
    msg,
    msg.isGroup ? null : contactId,
  );

  let mediaPath: string | null = null;
  let mediaMime: string | null = msg.media?.mime ?? null;
  if (msg.media) {
    try {
      const stored = await storeMedia(channel.account_id, conversationId, msg.media);
      if (stored) ({ path: mediaPath, mime: mediaMime } = stored);
    } catch (err) {
      console.warn("[ingest] mídia não armazenada", String(err));
    }
  }

  const row = {
    account_id: channel.account_id,
    conversation_id: conversationId,
    direction: msg.direction,
    sender_type: msg.direction === "in" ? "contact" : "user",
    sender_name: msg.isGroup ? msg.senderName : null,
    sender_handle: msg.isGroup ? msg.senderHandle : null,
    type: msg.type,
    body: msg.body,
    media_url: mediaPath,
    media_mime: mediaMime,
    media_name: msg.media?.name ?? null,
    external_id: msg.externalId,
    reply_to_external_id: msg.replyToExternalId ?? null,
    status: msg.direction === "in" ? "received" : "sent",
    metadata: msg.metadata ?? {},
    created_at: msg.sentAt ?? new Date().toISOString(),
  };
  const { data, error } = await db.from("messages").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505")
      return { messageId: null, conversationId, contactId, duplicate: true };
    throw new Error(`gravar mensagem: ${error.message}`);
  }
  await db
    .from("channels")
    .update({ last_event_at: new Date().toISOString(), status: "connected" })
    .eq("id", channel.id);

  if (msg.direction === "in" && contactId && !msg.isGroup) {
    scheduleClassification(channel.account_id, contactId);
  }
  // Mensagem de cliente: acorda o app agora, sem esperar a batida de 5 s do agendador. Vale para
  // WhatsApp e Instagram (os dois gravam por aqui). Falha não atrapalha: o agendador pega depois.
  if (msg.direction === "in" && !msg.isGroup) await wakeApp();
  return { messageId: data.id, conversationId, contactId, duplicate: false };
}

// Atualiza status de entrega de uma mensagem já gravada.
export async function updateMessageStatus(
  accountId: string,
  externalId: string,
  status: string,
  error?: string | null,
) {
  const allowed = ["sent", "delivered", "read", "failed"];
  if (!allowed.includes(status)) return;
  const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
  const db = adminClient();
  const { data: m } = await db
    .from("messages")
    .select("id, status")
    .eq("account_id", accountId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!m) return;
  if (status !== "failed" && (rank[m.status] ?? 0) >= rank[status]) return; // nunca regride
  await db
    .from("messages")
    .update({ status, error: error ?? null })
    .eq("id", m.id);
}

export async function logEvent(
  provider: string,
  channelId: string | null,
  eventType: string | null,
  externalId: string | null,
  payload: unknown,
) {
  const { data, error } = await adminClient()
    .from("inbound_events")
    .insert({
      provider,
      channel_id: channelId,
      event_type: eventType,
      external_id: externalId,
      payload,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { id: null, duplicate: true };
  if (error) console.warn("[inbound_events]", error.message);
  return { id: (data?.id as number | undefined) ?? null, duplicate: false };
}

export async function markEvent(
  id: number | null,
  status: "processed" | "ignored" | "error",
  err?: string,
) {
  if (!id) return;
  await adminClient()
    .from("inbound_events")
    .update({ status, error: err ?? null })
    .eq("id", id);
}


declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/**
 * Chama a via rápida do app (a mesma do agendador) para a IA responder em segundos. Não espera a
 * rodada terminar (ela leva alguns segundos) nem corta a chamada: cortar cancelaria a rodada.
 */
async function wakeApp(): Promise<void> {
  try {
    const { data } = await adminClient().rpc("cron_config");
    const cfg = (data ?? {}) as { base_url?: string | null; secret?: string | null };
    if (!cfg.base_url || !cfg.secret) return;
    const call = fetch(`${cfg.base_url.replace(/\/+$/, "")}/api/public/cron?fast=1`, {
      method: "POST",
      headers: { "x-cron-secret": cfg.secret, "content-type": "application/json" },
      body: "{}",
    })
      .then((r) => r.body?.cancel())
      .catch(() => undefined);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(call);
  } catch {
    /* o agendador de 5 s cobre */
  }
}
