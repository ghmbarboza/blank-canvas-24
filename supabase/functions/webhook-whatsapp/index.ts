// Webhook da WhatsApp Cloud API. URL: /functions/v1/webhook-whatsapp?c=<channel_id>
// GET: verificação (hub.verify_token = channels.webhook_token). POST: X-Hub-Signature-256 com o App Secret.
import { serve, json, HttpError } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";
import { hmacHex, safeEqual } from "../_shared/crypto.ts";
import {
  ingestMessage,
  logEvent,
  markEvent,
  updateMessageStatus,
  type ChannelRow,
} from "../_shared/ingest.ts";
import {
  mediaDownload,
  normalizeInbound,
  type MetaChangeValue,
} from "../_shared/providers/meta.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

async function loadChannel(id: string | null) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "canal ausente");
  const { data } = await adminClient()
    .from("channels")
    .select("id, account_id, provider, platform, name, owner_user_id, external_id, webhook_token")
    .eq("id", id)
    .eq("provider", "whatsapp_cloud")
    .maybeSingle();
  if (!data) throw new HttpError(404, "canal desconhecido");
  return data;
}

serve(async (req) => {
  const url = new URL(req.url);
  const channel = await loadChannel(url.searchParams.get("c"));

  if (req.method === "GET") {
    const ok =
      url.searchParams.get("hub.mode") === "subscribe" &&
      safeEqual(url.searchParams.get("hub.verify_token"), channel.webhook_token);
    if (!ok) throw new HttpError(403, "token de verificação inválido");
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");

  const raw = await req.text();
  const appSecret = await getSecret("channel", channel.id, "app_secret");
  if (!appSecret) throw new HttpError(412, "App Secret não configurado");
  const sig = req.headers.get("x-hub-signature-256")?.replace(/^sha256=/, "");
  if (!safeEqual(sig, await hmacHex("SHA-256", appSecret, raw)))
    throw new HttpError(401, "assinatura inválida");

  const body = JSON.parse(raw) as {
    entry?: Array<{ changes?: Array<{ field?: string; value?: MetaChangeValue }> }>;
  };
  const logged = await logEvent("whatsapp_cloud", channel.id, "webhook", null, body);
  EdgeRuntime.waitUntil(process(channel as ChannelRow & { external_id: string }, body, logged.id));
  return json({ ok: true });
});

async function process(
  channel: ChannelRow & { external_id: string },
  body: { entry?: Array<{ changes?: Array<{ field?: string; value?: MetaChangeValue }> }> },
  eventId: number | null,
) {
  try {
    const token = await getSecret("channel", channel.id, "access_token");
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages" || !change.value) continue;
        const value = change.value;
        if (
          value.metadata?.phone_number_id &&
          value.metadata.phone_number_id !== channel.external_id
        )
          continue;
        for (const m of value.messages ?? []) {
          const norm = normalizeInbound(value, m);
          if (!norm) continue;
          if (norm.mediaId && token) {
            try {
              const dl = await mediaDownload(token, norm.mediaId);
              norm.msg.media = {
                ...norm.msg.media,
                url: dl.url,
                headers: dl.headers,
                mime: dl.mime,
              };
            } catch (err) {
              console.warn("[webhook-whatsapp] mídia", String(err));
              norm.msg.media = null;
            }
          }
          await ingestMessage(channel, norm.msg);
        }
        for (const s of value.statuses ?? []) {
          await updateMessageStatus(
            channel.account_id,
            s.id,
            s.status,
            s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null,
          );
        }
      }
    }
    await markEvent(eventId, "processed");
  } catch (err) {
    console.error("[webhook-whatsapp]", err);
    await markEvent(eventId, "error", String(err).slice(0, 500));
  }
}
