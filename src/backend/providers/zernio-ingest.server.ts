// Ingestão de mensagens da Zernio no modelo de conversas (porte para Node de _shared/ingest.ts).
// Idempotente por (conta, external_id) e por (canal, external_thread_id). A IA, a classificação
// e as automações são disparadas pelos gatilhos de `messages` (domain_events), não daqui.
import { randomUUID } from "node:crypto";

import { admin } from "@/backend/http.server";
import type { Json } from "@/integrations/supabase/types";

import { nextStatus, type NormalizedMessage } from "./zernio-normalize";
import { messageTouch } from "./zernio-origin";
import { downloadMedia } from "./zernio-whatsapp.server";

export interface ChannelRow {
  id: string;
  account_id: string;
  provider: string;
  platform: string;
  name: string;
  owner_user_id: string | null;
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

async function storeMedia(
  accountId: string,
  conversationId: string,
  media: NonNullable<NormalizedMessage["media"]>,
  apiKey: string | null,
) {
  const got = await downloadMedia(apiKey, media.url, media.auth, MAX_MEDIA_BYTES);
  if (!got) return null;
  const mime = got.mime !== "application/octet-stream" ? got.mime : (media.mime ?? got.mime);
  const ext = EXT_BY_MIME[mime] ?? media.name?.split(".").pop()?.slice(0, 8) ?? "bin";
  const path = `${accountId}/${conversationId}/${randomUUID()}.${ext}`;
  const { error } = await admin()
    .storage.from("media")
    .upload(path, got.bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`upload de mídia falhou: ${error.message}`);
  return { path, mime };
}

async function linkIdentity(
  accountId: string,
  contactId: string,
  platform: string,
  handle: string,
  name: string | null,
) {
  await admin()
    .from("contact_identities")
    .upsert(
      { account_id: accountId, contact_id: contactId, platform, handle, display_name: name },
      { onConflict: "account_id,platform,handle", ignoreDuplicates: true },
    );
}

// De onde a pessoa veio: o primeiro toque fica para sempre; anúncio atualiza o último toque
// (é ele que trouxe a pessoa de volta). Um update com filtro, sem leitura antes.
async function recordOrigin(contactId: string, platform: string, msg: NormalizedMessage) {
  const db = admin();
  const { touch, paid } = messageTouch(
    platform,
    msg.origin,
    msg.sentAt ?? new Date().toISOString(),
  );
  const value = touch as unknown as Json;
  await db
    .from("contacts")
    .update({ first_touch: value, last_touch: value })
    .eq("id", contactId)
    .is("first_touch", null);
  if (paid) await db.from("contacts").update({ last_touch: value }).eq("id", contactId);
}

async function findOrCreateContact(channel: ChannelRow, msg: NormalizedMessage): Promise<string> {
  const db = admin();
  const handle = msg.senderHandle ?? msg.threadId;
  const { data: identity } = await db
    .from("contact_identities")
    .select("contact_id")
    .eq("account_id", channel.account_id)
    .eq("platform", channel.platform)
    .eq("handle", handle)
    .maybeSingle();
  if (identity) {
    const { data: c } = await db
      .from("contacts")
      .select("name, avatar_url, phone")
      .eq("id", identity.contact_id)
      .single();
    const patch: { name?: string; avatar_url?: string; phone?: string } = {};
    if (!c?.name && msg.senderName) patch.name = msg.senderName;
    if (!c?.avatar_url && msg.senderAvatar) patch.avatar_url = msg.senderAvatar;
    // BSUID chegou antes do telefone: completa o telefone quando a Meta passar a mandar.
    if (!c?.phone && msg.contactPhone) patch.phone = msg.contactPhone;
    if (Object.keys(patch).length)
      await db.from("contacts").update(patch).eq("id", identity.contact_id);
    return identity.contact_id;
  }

  if (msg.contactPhone) {
    const { data: byPhone } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", channel.account_id)
      .eq("phone", msg.contactPhone)
      .limit(1)
      .maybeSingle();
    if (byPhone) {
      await linkIdentity(channel.account_id, byPhone.id, channel.platform, handle, msg.senderName);
      return byPhone.id;
    }
    // Identidade antiga gravada pelo telefone (antes do BSUID): mesma pessoa.
    if (handle !== msg.contactPhone) {
      const { data: old } = await db
        .from("contact_identities")
        .select("contact_id")
        .eq("account_id", channel.account_id)
        .eq("platform", channel.platform)
        .eq("handle", msg.contactPhone)
        .maybeSingle();
      if (old) {
        await linkIdentity(
          channel.account_id,
          old.contact_id,
          channel.platform,
          handle,
          msg.senderName,
        );
        return old.contact_id;
      }
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
  if (error || !created) throw new Error(`criar contato: ${error?.message}`);
  const { error: idErr } = await db.from("contact_identities").insert({
    account_id: channel.account_id,
    contact_id: created.id,
    platform: channel.platform,
    handle,
    display_name: msg.senderName,
  });
  if (idErr?.code === "23505") {
    // Corrida entre dois webhooks: fica com o contato do outro.
    await db.from("contacts").delete().eq("id", created.id);
    const { data: winner } = await db
      .from("contact_identities")
      .select("contact_id")
      .eq("account_id", channel.account_id)
      .eq("platform", channel.platform)
      .eq("handle", handle)
      .single();
    if (!winner) throw new Error("identidade do contato sumiu na corrida");
    return winner.contact_id;
  }
  return created.id;
}

async function findOrCreateConversation(
  channel: ChannelRow,
  msg: NormalizedMessage,
  contactId: string | null,
) {
  const db = admin();
  const { data: existing } = await db
    .from("conversations")
    .select("id, title")
    .eq("channel_id", channel.id)
    .eq("external_thread_id", msg.threadId)
    .maybeSingle();
  if (existing) {
    if (msg.isGroup && msg.groupTitle && existing.title !== msg.groupTitle)
      await db.from("conversations").update({ title: msg.groupTitle }).eq("id", existing.id);
    return existing.id;
  }
  // Conversa aberta por nós pelo telefone (modelo enviado antes do 1º webhook): adota o id da Zernio.
  if (contactId && msg.contactPhone) {
    const { data: byPhone } = await db
      .from("conversations")
      .select("id")
      .eq("channel_id", channel.id)
      .eq("external_thread_id", msg.contactPhone)
      .maybeSingle();
    if (byPhone) {
      await db
        .from("conversations")
        .update({ external_thread_id: msg.threadId })
        .eq("id", byPhone.id);
      return byPhone.id;
    }
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
  if (error || !data) throw new Error(`criar conversa: ${error?.message}`);
  return data.id;
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
  apiKey: string | null,
): Promise<IngestResult> {
  const db = admin();
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
  if (contactId && msg.direction === "in" && !msg.isGroup)
    await recordOrigin(contactId, channel.platform, msg);
  const conversationId = await findOrCreateConversation(
    channel,
    msg,
    msg.isGroup ? null : contactId,
  );

  let mediaPath: string | null = null;
  let mediaMime: string | null = msg.media?.mime ?? null;
  if (msg.media) {
    try {
      const stored = await storeMedia(channel.account_id, conversationId, msg.media, apiKey);
      if (stored) ({ path: mediaPath, mime: mediaMime } = stored);
    } catch (err) {
      console.warn("[zernio-ingest] mídia não armazenada", String(err));
    }
  }

  const { data, error } = await db
    .from("messages")
    .insert({
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
      status: msg.direction === "in" ? "received" : "sent",
      metadata: (msg.metadata ?? {}) as never,
      created_at: msg.sentAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { messageId: null, conversationId, contactId, duplicate: true };
    throw new Error(`gravar mensagem: ${error.message}`);
  }
  await db
    .from("channels")
    .update({ last_event_at: new Date().toISOString(), status: "connected" })
    .eq("id", channel.id);
  return { messageId: data.id, conversationId, contactId, duplicate: false };
}

export async function updateMessageStatus(
  accountId: string,
  externalId: string,
  status: string,
  err: string | null,
) {
  const db = admin();
  const { data: m } = await db
    .from("messages")
    .select("id, status")
    .eq("account_id", accountId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!m) return;
  const next = nextStatus(m.status, status);
  if (!next) return;
  await db
    .from("messages")
    .update({ status: next, error: next === "failed" ? err : null })
    .eq("id", m.id);
}

export async function logEvent(
  eventName: string,
  dedupeKey: string | null,
  payload: unknown,
  channelId: string | null,
) {
  const { data, error } = await admin()
    .from("inbound_events")
    .insert({
      provider: "zernio",
      channel_id: channelId,
      event_type: eventName,
      external_id: dedupeKey,
      payload: payload as never,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return { id: null, duplicate: true };
  if (error) console.warn("[zernio inbound_events]", error.message);
  return { id: data?.id ?? null, duplicate: false };
}

export async function markEvent(
  id: number | null,
  status: "processed" | "ignored" | "error",
  err?: string,
) {
  if (!id) return;
  await admin()
    .from("inbound_events")
    .update({ status, error: err ?? null })
    .eq("id", id);
}
