// Webhook da Zernio. URL: /functions/v1/webhook-zernio?a=<account_id>
// Assinatura: HMAC-SHA256 hex do corpo cru em X-Zernio-Signature, com o segredo da conta.
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
import { normalizeMessage, toPlatform, type ZernioEvent } from "../_shared/providers/zernio.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
  const accountId = new URL(req.url).searchParams.get("a");
  if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) throw new HttpError(400, "conta ausente");

  const raw = await req.text();
  const secret = await getSecret("integration", accountId, "zernio_webhook_secret");
  if (!secret) throw new HttpError(404, "integração não configurada");
  const signature = req.headers.get("x-zernio-signature") ?? req.headers.get("x-late-signature");
  if (!safeEqual(signature?.toLowerCase(), await hmacHex("SHA-256", secret, raw))) {
    throw new HttpError(401, "assinatura inválida");
  }

  let evt: ZernioEvent;
  try {
    evt = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
  const eventName = req.headers.get("x-zernio-event") ?? evt.event ?? "unknown";
  const eventId = req.headers.get("x-zernio-event-id") ?? evt.id ?? null;

  const logged = await logEvent(
    "zernio",
    null,
    eventName,
    eventId ? `${accountId}:${eventId}` : null,
    evt,
  );
  if (logged.duplicate) return json({ ok: true, duplicate: true });
  EdgeRuntime.waitUntil(process(accountId, eventName, evt, logged.id));
  return json({ ok: true });
});

async function channelFor(accountId: string, evt: ZernioEvent): Promise<ChannelRow | null> {
  const zernioAccountId = evt.account?.accountId ?? evt.account?.id;
  if (!zernioAccountId) return null;
  const db = adminClient();
  const { data } = await db
    .from("channels")
    .select("id, account_id, provider, platform, name, owner_user_id")
    .eq("account_id", accountId)
    .eq("provider", "zernio")
    .eq("external_id", zernioAccountId)
    .maybeSingle();
  return (data as ChannelRow | null) ?? null;
}

async function process(
  accountId: string,
  eventName: string,
  evt: ZernioEvent,
  eventId: number | null,
) {
  const db = adminClient();
  try {
    if (eventName === "account.connected" && evt.account) {
      const ext = evt.account.accountId ?? evt.account.id;
      const platform = toPlatform(evt.account.platform ?? "instagram");
      const { data: taken } = ext
        ? await db
            .from("channels")
            .select("account_id")
            .eq("provider", "zernio")
            .eq("external_id", ext)
            .maybeSingle()
        : { data: null };
      if (ext && (!taken || taken.account_id === accountId)) {
        await db.from("channels").upsert(
          {
            account_id: accountId,
            provider: "zernio",
            platform,
            external_id: ext,
            name: evt.account.displayName ?? evt.account.username ?? platform,
            handle: evt.account.username ? `@${evt.account.username}` : null,
            status: "connected",
          },
          { onConflict: "provider,external_id" },
        );
      }
      await markEvent(eventId, "processed");
      return;
    }
    const channel = await channelFor(accountId, evt);
    if (!channel) {
      await markEvent(eventId, "ignored", "conta Zernio sem canal");
      return;
    }
    if (eventName === "account.disconnected") {
      await db.from("channels").update({ status: "disconnected" }).eq("id", channel.id);
    } else if (eventName === "message.received" || eventName === "message.sent") {
      const msg = normalizeMessage(evt);
      if (msg) await ingestMessage(channel, msg);
    } else if (["message.delivered", "message.read", "message.failed"].includes(eventName)) {
      const ext = evt.message?.platformMessageId ?? evt.message?.id;
      const status = eventName.split(".")[1];
      if (ext)
        await updateMessageStatus(
          channel.account_id,
          ext,
          status,
          evt.message?.error?.message ?? null,
        );
    } else {
      await markEvent(eventId, "ignored");
      return;
    }
    await markEvent(eventId, "processed");
  } catch (err) {
    console.error("[webhook-zernio]", err);
    await markEvent(eventId, "error", String(err).slice(0, 500));
  }
}
