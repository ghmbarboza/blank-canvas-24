// Envio do atendente pela caixa de entrada num WhatsApp da Zernio (mesmo corpo do edge
// send-message): grava "na fila", envia texto, mídia ou modelo e marca o resultado.
import { HttpError, admin, type Caller } from "@/backend/http.server";

import { WindowClosedError, dispatchZernioWhatsApp } from "./zernio-send.server";
import { zernioFriendly } from "./zernio-client.server";

export interface InboxSendBody {
  conversationId?: string;
  text?: string;
  mediaPath?: string;
  mediaMime?: string;
  mediaName?: string;
  template?: { name: string; language: string; params?: string[] };
}

const MAX_TEXT = 4096;
const MANAGERS = ["owner", "admin", "manager"];

function messageType(b: InboxSendBody): string {
  if (b.template) return "template";
  const m = b.mediaMime ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return b.mediaPath ? "document" : "text";
}

function validTemplate(t: InboxSendBody["template"]): boolean {
  return (
    !t ||
    (/^[a-z0-9_]{1,512}$/.test(t.name) &&
      /^[A-Za-z_]{2,10}$/.test(t.language) &&
      (t.params ?? []).every((v) => typeof v === "string" && v.length <= 1024))
  );
}

export async function sendFromInbox(caller: Caller, body: InboxSendBody) {
  const text = body.text?.trim() ?? "";
  if (!text && !body.mediaPath && !body.template)
    throw new HttpError(400, "Mensagem vazia", "empty");
  if (text.length > MAX_TEXT) throw new HttpError(400, "Mensagem longa demais", "too_long");
  if (!validTemplate(body.template)) throw new HttpError(400, "Modelo inválido", "bad_template");
  if (body.mediaPath && !body.mediaPath.startsWith(`${caller.accountId}/`))
    throw new HttpError(403, "Arquivo de outra conta", "forbidden");

  const db = admin();
  const { data: conv } = await db
    .from("conversations")
    .select(
      "id, contact_id, external_thread_id, last_inbound_at, assignee_user_id, channels(id, provider, platform, external_id, owner_user_id, is_shared, status)",
    )
    .eq("id", String(body.conversationId ?? ""))
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!conv) throw new HttpError(404, "Conversa não encontrada", "not_found");
  const ch = conv.channels as unknown as {
    id: string;
    provider: string;
    platform: string;
    external_id: string | null;
    owner_user_id: string | null;
    is_shared: boolean;
    status: string | null;
  } | null;
  if (!ch) throw new HttpError(409, "O canal desta conversa foi removido", "channel_removed");
  // Canal desconectado não envia (S13).
  if (ch.status && ch.status !== "connected")
    throw new HttpError(
      409,
      "Canal desconectado. Reconecte em Canais antes de enviar.",
      "channel_disconnected",
    );
  if (ch.provider !== "zernio" || ch.platform !== "whatsapp" || !ch.external_id)
    throw new HttpError(400, "Esta conversa não é de WhatsApp pela Zernio", "wrong_channel");
  if (
    !MANAGERS.includes(caller.role) &&
    !ch.is_shared &&
    ch.owner_user_id !== caller.userId &&
    conv.assignee_user_id !== caller.userId
  )
    throw new HttpError(403, "Canal de outro vendedor", "forbidden");

  let mediaUrl: string | null = null;
  if (body.mediaPath) {
    const { data: signed, error } = await db.storage
      .from("media")
      .createSignedUrl(body.mediaPath, 60 * 60);
    if (error || !signed) throw new HttpError(400, "Arquivo não encontrado", "no_media");
    mediaUrl = signed.signedUrl;
  }

  const { data: pending, error: insErr } = await db
    .from("messages")
    .insert({
      account_id: caller.accountId,
      conversation_id: conv.id,
      direction: "out",
      sender_type: "user",
      sender_user_id: caller.userId,
      type: messageType(body),
      body: body.template ? `[template] ${body.template.name}` : text || null,
      media_url: body.mediaPath ?? null,
      media_mime: body.mediaMime ?? null,
      media_name: body.mediaName ?? null,
      status: "queued",
    })
    .select("id")
    .single();
  if (insErr || !pending) throw new HttpError(500, "Falha ao registrar a mensagem", "insert");

  try {
    const externalId = await dispatchZernioWhatsApp(
      caller.accountId,
      ch.external_id,
      {
        id: conv.id,
        external_thread_id: conv.external_thread_id,
        last_inbound_at: conv.last_inbound_at,
        contact_id: conv.contact_id,
      },
      body.template
        ? { template: body.template }
        : {
            text,
            media: mediaUrl
              ? { url: mediaUrl, mime: body.mediaMime ?? null, name: body.mediaName ?? null }
              : null,
          },
    );
    await db
      .from("messages")
      .update({ status: "sent", external_id: externalId })
      .eq("id", pending.id);
    if (!conv.assignee_user_id)
      await db.from("conversations").update({ assignee_user_id: caller.userId }).eq("id", conv.id);
    return { ok: true, messageId: pending.id, externalId };
  } catch (err) {
    if (err instanceof WindowClosedError) {
      await db.from("messages").delete().eq("id", pending.id);
      throw new HttpError(409, err.message, "window_closed");
    }
    const message = zernioFriendly(err).slice(0, 400);
    await db.from("messages").update({ status: "failed", error: message }).eq("id", pending.id);
    throw new HttpError(502, `O WhatsApp recusou o envio: ${message}`, "provider_error");
  }
}
