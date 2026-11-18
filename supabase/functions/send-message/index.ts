// Envia uma mensagem de um atendente para o canal da conversa.
// Corpo: { accountId, conversationId, text?, mediaPath?, mediaMime?, mediaName?, template? }
import { serve, json, HttpError, readJson } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { requireMember, isManager } from "../_shared/auth.ts";
import { getSecret } from "../_shared/secrets.ts";
import * as evolution from "../_shared/providers/evolution.ts";
import * as zernio from "../_shared/providers/zernio.ts";
import * as meta from "../_shared/providers/meta.ts";

interface Body {
  accountId: string;
  conversationId: string;
  text?: string;
  mediaPath?: string;
  mediaMime?: string;
  mediaName?: string;
  template?: { name: string; language: string; params?: string[] };
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 4096;

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const body = await readJson<Body>(req);
  const caller = await requireMember(req, body.accountId);
  const text = body.text?.trim() ?? "";
  if (!text && !body.mediaPath && !body.template)
    throw new HttpError(400, "Mensagem vazia", "empty");
  if (text.length > MAX_TEXT) throw new HttpError(400, "Mensagem longa demais", "too_long");
  if (body.mediaPath && !body.mediaPath.startsWith(`${caller.accountId}/`))
    throw new HttpError(403, "Arquivo de outra conta");

  const db = adminClient();
  const { data: conv } = await db
    .from("conversations")
    .select(
      "id, account_id, channel_id, external_thread_id, is_group, last_inbound_at, assignee_user_id, channels(id, provider, platform, external_id, config, owner_user_id, is_shared, status)",
    )
    .eq("id", body.conversationId)
    .eq("account_id", caller.accountId)
    .maybeSingle();
  if (!conv) throw new HttpError(404, "Conversa não encontrada");
  if (!conv.channels)
    throw new HttpError(409, "O canal desta conversa foi removido", "channel_removed");
  const channel = conv.channels as unknown as {
    id: string;
    provider: string;
    platform: string;
    external_id: string;
    config: Record<string, string>;
    owner_user_id: string | null;
    is_shared: boolean;
    status: string;
  };
  // SMS da Zadarma sai pela rota /api/sms do app (consentimento, teto diário e assinatura da Zadarma).
  if (channel.provider === "zadarma")
    throw new HttpError(409, "SMS sai pela Caixa de entrada do app, não por aqui", "sms_via_app");
  // Canal desconectado (ou com erro) não envia: a mensagem ficaria "enviada" sem sair (S13).
  if (channel.status && channel.status !== "connected")
    throw new HttpError(
      409,
      "Canal desconectado. Reconecte em Canais antes de enviar.",
      "channel_disconnected",
    );
  if (
    !isManager(caller.role) &&
    !channel.is_shared &&
    channel.owner_user_id !== caller.userId &&
    conv.assignee_user_id !== caller.userId
  ) {
    throw new HttpError(403, "Canal de outro vendedor");
  }

  // Janela de 24 h: WhatsApp oficial exige template; Instagram/Messenger via Zernio usam HUMAN_AGENT.
  const outsideWindow =
    !conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > WINDOW_MS;
  if (channel.provider === "whatsapp_cloud" && outsideWindow && !body.template) {
    throw new HttpError(409, "Fora da janela de 24 h: envie um template aprovado", "window_closed");
  }

  let mediaUrl: string | null = null;
  if (body.mediaPath) {
    const { data: signed, error } = await db.storage
      .from("media")
      .createSignedUrl(body.mediaPath, 60 * 60);
    if (error || !signed) throw new HttpError(400, "Arquivo não encontrado");
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
      type: body.template
        ? "template"
        : body.mediaMime?.startsWith("image/")
          ? "image"
          : body.mediaMime?.startsWith("audio/")
            ? "audio"
            : body.mediaMime?.startsWith("video/")
              ? "video"
              : body.mediaPath
                ? "document"
                : "text",
      body: body.template ? `[template] ${body.template.name}` : text || null,
      media_url: body.mediaPath ?? null,
      media_mime: body.mediaMime ?? null,
      media_name: body.mediaName ?? null,
      status: "queued",
    })
    .select("id")
    .single();
  if (insErr) throw new HttpError(500, "Falha ao registrar a mensagem");

  try {
    const externalId = await dispatch(caller.accountId, channel, conv.external_thread_id, {
      text,
      mediaUrl,
      mediaMime: body.mediaMime,
      mediaName: body.mediaName,
      template: body.template,
      outsideWindow,
    });
    await db
      .from("messages")
      .update({ status: "sent", external_id: externalId })
      .eq("id", pending.id);
    if (!conv.assignee_user_id)
      await db.from("conversations").update({ assignee_user_id: caller.userId }).eq("id", conv.id);
    return json({ ok: true, messageId: pending.id, externalId });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 400);
    await db.from("messages").update({ status: "failed", error: message }).eq("id", pending.id);
    throw new HttpError(502, `O canal recusou o envio: ${message}`, "provider_error");
  }
});

async function dispatch(
  accountId: string,
  channel: {
    id: string;
    provider: string;
    platform: string;
    external_id: string;
    config: Record<string, string>;
  },
  to: string,
  p: {
    text: string;
    mediaUrl: string | null;
    mediaMime?: string;
    mediaName?: string;
    template?: Body["template"];
    outsideWindow: boolean;
  },
): Promise<string | null> {
  if (channel.provider === "evolution") {
    const apiKey = await getSecret("integration", accountId, "evolution_api_key");
    const { data: integ } = await adminClient()
      .from("account_integrations")
      .select("config")
      .eq("account_id", accountId)
      .eq("provider", "evolution")
      .single();
    const baseUrl = (integ?.config as { base_url?: string } | null)?.base_url;
    if (!apiKey || !baseUrl) throw new Error("Evolution não configurada");
    const cfg = { baseUrl, apiKey };
    if (p.mediaUrl) {
      return await evolution.sendMedia(cfg, channel.external_id, to, {
        url: p.mediaUrl,
        mime: p.mediaMime ?? "application/octet-stream",
        name: p.mediaName,
        caption: p.text || undefined,
      });
    }
    return await evolution.sendText(cfg, channel.external_id, to, p.text);
  }
  if (channel.provider === "zernio") {
    const apiKey = await getSecret("integration", accountId, "zernio_api_key");
    if (!apiKey) throw new Error("Zernio não configurada");
    const attachmentType = !p.mediaMime
      ? undefined
      : p.mediaMime.startsWith("image/")
        ? "image"
        : p.mediaMime.startsWith("video/")
          ? "video"
          : p.mediaMime.startsWith("audio/")
            ? "audio"
            : "file";
    return await zernio.sendMessage(apiKey, to, channel.external_id, {
      text: p.text || null,
      attachmentUrl: p.mediaUrl ?? undefined,
      attachmentType,
      humanAgentTag: p.outsideWindow && ["instagram", "facebook"].includes(channel.platform),
    });
  }
  if (channel.provider === "whatsapp_cloud") {
    const token = await getSecret("channel", channel.id, "access_token");
    if (!token) throw new Error("Token da Meta ausente");
    if (p.template) {
      return await meta.sendTemplate(
        token,
        channel.external_id,
        to,
        p.template.name,
        p.template.language,
        p.template.params ?? [],
      );
    }
    if (p.mediaUrl) {
      return await meta.sendMedia(token, channel.external_id, to, {
        url: p.mediaUrl,
        mime: p.mediaMime ?? "application/octet-stream",
        name: p.mediaName,
        caption: p.text || undefined,
      });
    }
    return await meta.sendText(token, channel.external_id, to, p.text);
  }
  // SMS (Zadarma) sai pela rota /api/sms do app, não por aqui.
  throw new Error(`Provedor ${channel.provider} ainda não envia mensagens`);
}
