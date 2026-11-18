// Webhook da Evolution API. URL: /functions/v1/webhook-evolution?c=<channel_id>
// A Evolution não assina o payload: conferimos o header secreto (channels.webhook_token)
// e que body.instance é a instância daquele canal.
import { serve, json, HttpError } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { safeEqual } from "../_shared/crypto.ts";
import {
  ingestMessage,
  logEvent,
  markEvent,
  updateMessageStatus,
  type ChannelRow,
} from "../_shared/ingest.ts";
import { mapAckStatus, normalizeUpsert } from "../_shared/providers/evolution.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const channelId = new URL(req.url).searchParams.get("c");
  if (!channelId || !/^[0-9a-f-]{36}$/i.test(channelId)) throw new HttpError(400, "canal ausente");

  const db = adminClient();
  const { data: channel } = await db
    .from("channels")
    .select(
      "id, account_id, provider, platform, name, owner_user_id, external_id, webhook_token, config",
    )
    .eq("id", channelId)
    .eq("provider", "evolution")
    .maybeSingle();
  if (!channel) throw new HttpError(404, "canal desconhecido");
  if (!safeEqual(req.headers.get("x-webhook-secret"), channel.webhook_token)) {
    throw new HttpError(401, "assinatura inválida");
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.instance !== channel.external_id)
    throw new HttpError(400, "instância não confere");
  const event = String(body.event ?? "")
    .replace(/\./g, "_")
    .toLowerCase();
  const data = body.data as Record<string, unknown> | undefined;
  const externalId =
    event === "messages_upsert"
      ? `${channel.id}:${(data?.key as { id?: string } | undefined)?.id ?? crypto.randomUUID()}`
      : null;

  const logged = await logEvent("evolution", channel.id, event, externalId, body);
  if (logged.duplicate) return json({ ok: true, duplicate: true });

  EdgeRuntime.waitUntil(
    process(
      channel as ChannelRow & { config: Record<string, unknown> },
      event,
      data,
      body,
      logged.id,
    ),
  );
  return json({ ok: true });
});

async function process(
  channel: ChannelRow & { config: Record<string, unknown> },
  event: string,
  data: Record<string, unknown> | undefined,
  body: Record<string, unknown>,
  eventId: number | null,
) {
  const db = adminClient();
  try {
    if (event === "messages_upsert" || event === "send_message") {
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const msg = normalizeUpsert(
          (item ?? {}) as never,
          typeof body.base64 === "string" ? body.base64 : undefined,
        );
        if (!msg) continue;
        if (msg.isGroup && !msg.groupTitle) {
          const { data: conv } = await db
            .from("conversations")
            .select("title")
            .eq("channel_id", channel.id)
            .eq("external_thread_id", msg.threadId)
            .maybeSingle();
          msg.groupTitle = conv?.title ?? null;
        }
        await ingestMessage(channel, msg);
      }
    } else if (event === "messages_update") {
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const it = item as { keyId?: string; key?: { id?: string }; status?: unknown } | undefined;
        const id = it?.keyId ?? it?.key?.id;
        const status = mapAckStatus(it?.status);
        if (id && status) await updateMessageStatus(channel.account_id, id, status);
      }
    } else if (event === "connection_update") {
      const state = String((data as { state?: string } | undefined)?.state ?? "");
      const status =
        state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
      const wuid = (data as { wuid?: string } | undefined)?.wuid;
      const handle = wuid ? `+${wuid.split("@")[0].split(":")[0]}` : undefined;
      await db
        .from("channels")
        .update({ status, status_detail: state, ...(handle ? { handle } : {}) })
        .eq("id", channel.id);
    } else if (event === "qrcode_updated") {
      const qr = (data as { qrcode?: { base64?: string } } | undefined)?.qrcode?.base64;
      if (qr)
        await db
          .from("channels")
          .update({ status: "connecting", config: { ...channel.config, last_qr: qr } })
          .eq("id", channel.id);
    } else if (event === "groups_upsert" || event === "group_update") {
      const groups = Array.isArray(data) ? data : [data];
      for (const g of groups) {
        const grp = g as { id?: string; subject?: string } | undefined;
        if (grp?.id && grp.subject) {
          await db
            .from("conversations")
            .update({ title: grp.subject })
            .eq("channel_id", channel.id)
            .eq("external_thread_id", grp.id);
        }
      }
    } else {
      await markEvent(eventId, "ignored");
      return;
    }
    await markEvent(eventId, "processed");
  } catch (err) {
    console.error("[webhook-evolution]", err);
    await markEvent(eventId, "error", String(err).slice(0, 500));
  }
}
