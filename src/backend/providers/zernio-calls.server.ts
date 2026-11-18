// Ligações da Zernio (telefone e WhatsApp) no histórico único `calls`, e a resposta do cliente
// ao pedido de permissão de ligação pelo WhatsApp.
import { admin } from "@/backend/http.server";
import { afterCallEnded, findContactByPhone } from "@/backend/telephony/core.server";
import { digits } from "@/features/telephony/lib";

import {
  callChannel,
  callCostUsd,
  callNumbers,
  callOutcome,
  type ZernioEvent,
} from "./zernio-normalize";

async function notifyIncoming(
  accountId: string,
  contact: Awaited<ReturnType<typeof findContactByPhone>>,
  from: string | null,
) {
  const db = admin();
  const targets = contact?.owner_user_id
    ? [contact.owner_user_id]
    : (
        (
          await db
            .from("memberships")
            .select("user_id")
            .eq("account_id", accountId)
            .eq("is_active", true)
            .in("role", ["owner", "admin", "manager", "agent"])
        ).data ?? []
      ).map((m) => m.user_id);
  for (const u of targets.slice(0, 20)) {
    await db.rpc("notify_user", {
      _account: accountId,
      _user: u,
      _kind: "call_incoming",
      _title: `Ligação de ${contact?.name ?? from ?? "número desconhecido"}`,
      _body: contact?.ai_summary ?? (contact ? "" : "Contato novo."),
      _link: contact ? `/contatos/${contact.id}` : "/ligacoes",
    });
  }
}

export async function handleCallEvent(
  accountId: string,
  eventName: string,
  evt: ZernioEvent,
): Promise<"processed" | "ignored"> {
  const call = evt.call;
  if (!call?.id) return "ignored";
  const db = admin();
  const channel = callChannel(call, evt.account?.platform);
  const { data: ensured, error } = await db.rpc("zernio_ensure_call", {
    _account: accountId,
    _zernio_call_id: call.id,
    _direction: call.direction ?? "inbound",
    _started_at: call.startedAt ?? call.failedAt ?? new Date().toISOString(),
    _channel: channel,
    _zernio_account_id: call.accountId ?? evt.account?.accountId ?? "",
  });
  if (error) throw new Error(`zernio_ensure_call: ${error.message}`);
  const row = (ensured as { call_id: string; created: boolean }[] | null)?.[0];
  if (!row) throw new Error("zernio_ensure_call não devolveu a ligação");

  const { from, to } = callNumbers(call);
  const inbound = call.direction !== "outbound";
  const { data: current } = await db.from("calls").select("*").eq("id", row.call_id).single();
  if (!current) throw new Error("ligação sumiu");
  const contact = current.contact_id
    ? null
    : await findContactByPhone(accountId, inbound ? from : to);
  const { data: num } = await db
    .from("zernio_numbers")
    .select("id, zernio_number_id")
    .eq("account_id", accountId)
    .eq("phone_number", (inbound ? to : from) ?? "")
    .maybeSingle();
  const metadata = {
    ...((current.metadata as Record<string, unknown> | null) ?? {}),
    provider: "zernio",
    zernio_call_id: call.id,
    channel,
    forward_to:
      call.forwardTo ??
      (current.metadata as Record<string, unknown> | null)?.["forward_to"] ??
      null,
    zernio_number_id: num?.zernio_number_id ?? null,
    zernio_conversation_id: call.conversationId ?? null,
  };

  if (eventName === "call.received") {
    await db
      .from("calls")
      .update({
        from_number: from,
        to_number: to,
        contact_id: current.contact_id ?? contact?.id ?? null,
        metadata: metadata as never,
      })
      .eq("id", row.call_id);
    if (row.created && inbound) await notifyIncoming(accountId, contact, from);
    return "processed";
  }

  const outcome = callOutcome(eventName, call);
  const duration = call.durationSeconds ?? 0;
  const recording = Boolean(call.recordingUrl);
  await db
    .from("calls")
    .update({
      from_number: current.from_number ?? from,
      to_number: current.to_number ?? to,
      contact_id: current.contact_id ?? contact?.id ?? null,
      status: outcome.status,
      disposition: call.endReason ?? (eventName === "call.failed" ? "failed" : null),
      disposition_reason: outcome.reason,
      hangup_cause: call.sipHangupCause ?? call.hangupCause ?? null,
      ended_at: call.endedAt ?? call.failedAt ?? new Date().toISOString(),
      duration_seconds: duration || null,
      billseconds: outcome.answered ? duration : 0,
      answered_at:
        current.answered_at ?? (outcome.answered && call.startedAt ? call.startedAt : null),
      cost_usd: callCostUsd(call),
      recording_status: recording ? "pending" : current.recording_status,
      metadata: {
        ...metadata,
        billing: call.billing ?? null,
        is_voicemail: call.isVoicemail ?? false,
      } as never,
    })
    .eq("id", row.call_id);
  await afterCallEnded(row.call_id);
  // Gravação e transcrição chegam no registro da ligação pouco depois; o job busca e processa.
  await db.rpc("enqueue_job", {
    _account: accountId,
    _kind: "zernio.call_sync",
    _payload: { call_id: row.call_id, zernio_call_id: call.id },
    _dedupe: `zernio.call_sync:${row.call_id}`,
  });
  return "processed";
}

/** O cliente respondeu ao pedido de permissão de ligação no WhatsApp. */
export async function handlePermissionEvent(
  accountId: string,
  channelId: string,
  evt: ZernioEvent,
) {
  const p = evt.permission;
  const phone = digits(p?.from);
  if (!p || phone.length < 8) return "ignored" as const;
  const granted = p.response === "accept";
  const contact = await findContactByPhone(accountId, `+${phone}`);
  const { data: prev } = await admin()
    .from("zernio_call_permissions")
    .select("requested_by")
    .eq("account_id", accountId)
    .eq("channel_id", channelId)
    .eq("phone", phone)
    .maybeSingle();
  if (prev?.requested_by)
    await admin().rpc("notify_user", {
      _account: accountId,
      _user: prev.requested_by,
      _kind: "call_permission",
      _title: granted
        ? `${contact?.name ?? "O cliente"} aceitou receber ligação`
        : `${contact?.name ?? "O cliente"} recusou ligação pelo WhatsApp`,
      _body: granted ? "Já dá para ligar pelo WhatsApp." : "Siga pela conversa escrita.",
      _link: contact ? `/contatos/${contact.id}` : "/conversas",
    });
  await admin()
    .from("zernio_call_permissions")
    .upsert(
      {
        account_id: accountId,
        channel_id: channelId,
        phone,
        contact_id: contact?.id ?? null,
        status: granted ? "granted" : "rejected",
        is_permanent: Boolean(p.isPermanent),
        expires_at: granted && !p.isPermanent ? (p.expirationTimestamp ?? null) : null,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,channel_id,phone" },
    );
  return "processed" as const;
}
