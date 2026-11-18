// Webhook único da Zernio por conta: /api/public/zernio?a=<conta>. Assinatura HMAC-SHA256 hex do
// corpo cru em X-Zernio-Signature (X-Late-Signature é o nome antigo), com o segredo da conta.
// Dedupe pelo id do evento (o mesmo do edge webhook-zernio, então a migração não duplica nada).
import { HttpError, admin, isUuid, json } from "@/backend/http.server";
import { digits } from "@/features/telephony/lib";

import { zernioKey } from "./zernio-client.server";
import { handleCallEvent, handlePermissionEvent } from "./zernio-calls.server";
import {
  ingestMessage,
  logEvent,
  markEvent,
  updateMessageStatus,
  type ChannelRow,
} from "./zernio-ingest.server";
import {
  deliveryStatus,
  eventKind,
  failureText,
  normalizeMessage,
  numberReason,
  numberStatusFor,
  signatureOk,
  toPlatform,
  zernioAccountOf,
  type ZernioEvent,
} from "./zernio-normalize";

async function webhookSecret(accountId: string): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: "zernio_webhook_secret",
  });
  return typeof data === "string" && data ? data : null;
}

async function channelFor(
  accountId: string,
  zernioAccountId: string | null,
): Promise<ChannelRow | null> {
  if (!zernioAccountId) return null;
  const { data } = await admin()
    .from("channels")
    .select("id, account_id, provider, platform, name, owner_user_id")
    .eq("account_id", accountId)
    .eq("provider", "zernio")
    .eq("external_id", zernioAccountId)
    .maybeSingle();
  return data ?? null;
}

async function onAccountConnected(accountId: string, evt: ZernioEvent) {
  const ext = zernioAccountOf(evt);
  if (!ext) return "ignored" as const;
  const db = admin();
  const { data: taken } = await db
    .from("channels")
    .select("account_id")
    .eq("provider", "zernio")
    .eq("external_id", ext)
    .maybeSingle();
  if (taken && taken.account_id !== accountId) return "ignored" as const;
  const platform = toPlatform(evt.account?.platform);
  const username = evt.account?.username ?? null;
  await db.from("channels").upsert(
    {
      account_id: accountId,
      provider: "zernio",
      platform,
      external_id: ext,
      name: (evt.account?.displayName ?? username ?? platform).slice(0, 80),
      handle: platform === "whatsapp" ? username : username ? `@${username}` : null,
      status: "connected",
    },
    { onConflict: "provider,external_id" },
  );
  return "processed" as const;
}

async function onNumberEvent(accountId: string, eventName: string, evt: ZernioEvent) {
  const n = evt.number;
  if (!n?.id) return "ignored" as const;
  const status = numberStatusFor(eventName);
  const patch: Record<string, unknown> = {
    account_id: accountId,
    zernio_number_id: n.id,
    last_event_at: new Date().toISOString(),
  };
  if (n.phoneNumber) patch["phone_number"] = n.phoneNumber;
  if (n.country) patch["country"] = n.country;
  if (n.profileId) patch["profile_id"] = n.profileId;
  if (status) patch["status"] = status;
  const reason = numberReason(evt);
  patch["status_reason"] = reason;
  if (evt.verificationUrl) patch["verification_url"] = evt.verificationUrl;
  await admin()
    .from("zernio_numbers")
    .upsert(patch as never, { onConflict: "account_id,zernio_number_id" });
  if (reason || status === "active")
    await notifyAdmins(
      accountId,
      status === "active"
        ? `Número ${n.phoneNumber ?? ""} ativo`
        : "Número da Zernio precisa de atenção",
      reason ?? "Já dá para ligar e conectar o WhatsApp nele.",
    );
  return "processed" as const;
}

async function notifyAdmins(accountId: string, title: string, body: string) {
  const db = admin();
  const { data } = await db
    .from("memberships")
    .select("user_id")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .in("role", ["owner", "admin"]);
  for (const m of (data ?? []).slice(0, 10)) {
    await db.rpc("notify_user", {
      _account: accountId,
      _user: m.user_id,
      _kind: "zernio_number",
      _title: title,
      _body: body,
      _link: "/canais",
    });
  }
}

interface IdentityEvent extends ZernioEvent {
  previous?: { phoneNumber?: string | null; businessScopedUserId?: string | null };
  current?: {
    phoneNumber?: string | null;
    businessScopedUserId?: string | null;
    username?: string | null;
  };
}

/** O cliente trocou de telefone ou de BSUID: a mesma pessoa ganha o identificador novo. */
async function onIdentityChanged(channel: ChannelRow, evt: IdentityEvent) {
  const db = admin();
  const olds = [evt.previous?.businessScopedUserId, digits(evt.previous?.phoneNumber)].filter(
    (v): v is string => Boolean(v),
  );
  if (!olds.length) return "ignored" as const;
  const { data: idt } = await db
    .from("contact_identities")
    .select("contact_id")
    .eq("account_id", channel.account_id)
    .eq("platform", channel.platform)
    .in("handle", olds)
    .limit(1)
    .maybeSingle();
  if (!idt) return "ignored" as const;
  const news = [evt.current?.businessScopedUserId, digits(evt.current?.phoneNumber)].filter(
    (v): v is string => Boolean(v),
  );
  for (const handle of news)
    await db.from("contact_identities").upsert(
      {
        account_id: channel.account_id,
        contact_id: idt.contact_id,
        platform: channel.platform,
        handle,
      },
      { onConflict: "account_id,platform,handle", ignoreDuplicates: true },
    );
  const phone = digits(evt.current?.phoneNumber);
  if (phone) await db.from("contacts").update({ phone }).eq("id", idt.contact_id);
  return "processed" as const;
}

export async function processEvent(
  accountId: string,
  eventName: string,
  evt: ZernioEvent,
): Promise<"processed" | "ignored"> {
  const kind = eventKind(eventName);
  if (kind === "ignored") return "ignored";
  if (kind === "account" && eventName === "account.connected")
    return onAccountConnected(accountId, evt);
  if (kind === "number") return onNumberEvent(accountId, eventName, evt);
  if (kind === "call") return handleCallEvent(accountId, eventName, evt);
  if (kind === "lead")
    return (await import("./zernio-leads.server")).onLeadReceived(accountId, evt);

  const channel = await channelFor(accountId, zernioAccountOf(evt));
  if (!channel) return "ignored";
  switch (kind) {
    case "account":
      await admin()
        .from("channels")
        .update({ status: "disconnected", status_detail: evt.reason ?? null })
        .eq("id", channel.id);
      return "processed";
    case "message": {
      const msg = normalizeMessage(evt);
      if (!msg) return "ignored";
      await ingestMessage(channel, msg, await zernioKey(accountId));
      return "processed";
    }
    case "status": {
      const status = deliveryStatus(eventName);
      const ext = evt.message?.platformMessageId ?? evt.message?.id;
      if (!status || !ext) return "ignored";
      await updateMessageStatus(channel.account_id, ext, status, failureText(evt));
      return "processed";
    }
    case "permission":
      return handlePermissionEvent(accountId, channel.id, evt);
    case "identity":
      return onIdentityChanged(channel, evt as IdentityEvent);
    default:
      return "ignored";
  }
}

export async function handleZernioWebhook(req: Request): Promise<Response> {
  const accountId = new URL(req.url).searchParams.get("a");
  if (!isUuid(accountId))
    throw new HttpError(400, "Conta ausente na URL do webhook", "bad_account");
  const raw = await req.text();
  const secret = await webhookSecret(accountId);
  if (!secret) throw new HttpError(404, "Zernio não configurada nesta conta", "not_configured");
  const sig = req.headers.get("x-zernio-signature") ?? req.headers.get("x-late-signature");
  if (!signatureOk(secret, raw, sig))
    throw new HttpError(401, "Assinatura inválida", "bad_signature");

  let evt: ZernioEvent;
  try {
    evt = JSON.parse(raw) as ZernioEvent;
  } catch {
    throw new HttpError(400, "JSON inválido", "bad_json");
  }
  const eventName = req.headers.get("x-zernio-event") ?? evt.event ?? "unknown";
  if (evt.test) return json({ ok: true, test: true });
  const eventId = req.headers.get("x-zernio-event-id") ?? evt.id ?? null;
  const logged = await logEvent(eventName, eventId ? `${accountId}:${eventId}` : null, evt, null);
  if (logged.duplicate) return json({ ok: true, duplicate: true });
  // Responde na hora e processa pela fila (fast tick, a cada 5 s). Processar dentro da requisição
  // estourava o tempo da Zernio com o servidor frio, e a requisição era cortada no meio (05/11).
  // Se não der para enfileirar, processa aqui mesmo, como antes.
  if (logged.id) {
    const { error: qErr } = await admin().rpc("enqueue_job", {
      _account: accountId,
      _kind: "zernio.event",
      _payload: { event_id: logged.id },
      _dedupe: `zernio.event:${logged.id}`,
    });
    if (!qErr) return json({ ok: true, queued: true });
    console.warn("[zernio webhook] fila indisponível, processando na hora:", qErr.message);
  }
  try {
    const result = await processEvent(accountId, eventName, evt);
    await markEvent(logged.id, result);
    return json({ ok: true, result });
  } catch (err) {
    console.error("[zernio webhook]", eventName, err);
    await markEvent(
      logged.id,
      "error",
      String(err instanceof Error ? err.message : err).slice(0, 500),
    );
    // Libera a chave de dedupe e responde 500: a Zernio reenvia (7 tentativas em ~51 h).
    if (logged.id)
      await admin()
        .from("inbound_events")
        .update({ external_id: `${accountId}:${eventId ?? "sem-id"}:erro:${Date.now()}` })
        .eq("id", logged.id);
    return json({ ok: false, error: "Falha ao processar; a Zernio vai reenviar" }, 500);
  }
}
