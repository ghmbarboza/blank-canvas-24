// Webhooks notify_* da Zadarma → tabela calls. Conta identificada por ?a=<conta>; assinatura
// conferida com o secret da própria conta e origem restrita aos IPs da Zadarma, sem desvio.
import { HttpError, admin, isUuid, json, trustedIp } from "@/backend/http.server";
import { verifyZadarmaNotify, zadarmaBalance } from "@/backend/providers/zadarma.server";
import { mapDisposition, toE164, zadarmaOriginCheck } from "@/features/telephony/lib";

import { afterCallEnded, findContactByPhone, zadarmaCreds } from "./core.server";

export async function handleZadarmaNotify(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("a");
  if (!isUuid(accountId))
    throw new HttpError(400, "Conta ausente na URL do webhook", "bad_account");
  // Só o cf-connecting-ip é confiável (x-forwarded-for o próprio cliente forja). Sem IP, recusa.
  const origin = zadarmaOriginCheck(trustedIp(req));
  if (!origin.ok)
    throw new HttpError(
      403,
      origin.reason === "missing_ip" ? "Origem desconhecida" : "Origem não autorizada",
      origin.reason,
    );

  const raw = await req.text();
  const form = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const event = form["event"] ?? "";
  const creds = await zadarmaCreds(accountId);
  if (
    !verifyZadarmaNotify(
      creds,
      event,
      form,
      req.headers.get("signature") ?? req.headers.get("Signature"),
    )
  )
    throw new HttpError(401, "Assinatura inválida", "bad_signature");

  if (event === "SMS") return ingestZadarmaSms(accountId, form["result"] ?? "");

  const db = admin();
  const pbx = form["pbx_call_id"] ?? null;
  const findCall = async () =>
    pbx
      ? (
          await db
            .from("calls")
            .select("*")
            .eq("account_id", accountId)
            .eq("pbx_call_id", pbx)
            .maybeSingle()
        ).data
      : null;
  const userByExtension = async (ext: string | undefined) => {
    if (!ext) return null;
    const { data } = await db
      .from("telephony_extensions")
      .select("user_id")
      .eq("account_id", accountId)
      .eq("extension", ext)
      .maybeSingle();
    return data?.user_id ?? null;
  };
  // call_start vem no fuso da conta Zadarma; o webhook chega em tempo real, então "agora" é mais confiável.
  const started = new Date().toISOString();

  switch (event) {
    case "NOTIFY_START":
    case "NOTIFY_OUT_START": {
      const inbound = event === "NOTIFY_START";
      const from =
        toE164(inbound ? form["caller_id"] : form["caller_id"] || form["internal"]) ??
        form["caller_id"] ??
        null;
      const to =
        toE164(inbound ? form["called_did"] : form["destination"]) ??
        (inbound ? form["called_did"] : form["destination"]) ??
        null;
      const contact = await findContactByPhone(accountId, inbound ? from : to);
      const userId = inbound ? null : await userByExtension(form["internal"]);
      const { data: num } = await db
        .from("phone_numbers")
        .select("id, queue_id")
        .eq("account_id", accountId)
        .eq("number", inbound ? (to ?? "") : (from ?? ""))
        .maybeSingle();
      const existing = await findCall();
      let callId = existing?.id ?? null;
      if (!existing) {
        const { data: created } = await db
          .from("calls")
          .insert({
            account_id: accountId,
            direction: inbound ? "inbound" : "outbound",
            from_number: from,
            to_number: to,
            contact_id: contact?.id ?? null,
            user_id: userId,
            phone_number_id: num?.id ?? null,
            queue_id: num?.queue_id ?? null,
            status: "ringing",
            started_at: started,
            pbx_call_id: pbx,
          })
          .select("id")
          .single();
        callId = created?.id ?? null;
      }
      // Fila única: a ligação já virou item (gatilho em calls). Escolhe o atendente pela
      // habilidade, capacidade e dono do caso, e responde à Zadarma para tocar no ramal dele.
      if (inbound && callId) {
        const { routeInboundCall } = await import("@/backend/routing/route-call.server");
        const route = await routeInboundCall(accountId, callId);
        if (route) return json(route);
      }
      // Ficha na tela de quem vai atender: dono do contato (ou gestores, se não tem dono).
      if (inbound) {
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
            _body:
              contact?.ai_summary ??
              (contact ? "" : "Contato novo: a ficha será criada ao atender."),
            _link: contact ? `/contatos/${contact.id}` : "/ligacoes",
          });
        }
      }
      break;
    }
    case "NOTIFY_INTERNAL":
    case "NOTIFY_ANSWER": {
      const userId = await userByExtension(form["internal"] ?? form["destination"]);
      const c = await findCall();
      if (c) {
        await db
          .from("calls")
          .update({
            ...(event === "NOTIFY_ANSWER"
              ? { status: "in_progress", answered_at: new Date().toISOString() }
              : {}),
            ...(userId && !c.user_id ? { user_id: userId } : {}),
          })
          .eq("id", c.id);
      }
      break;
    }
    case "NOTIFY_END":
    case "NOTIFY_OUT_END": {
      const c = await findCall();
      if (!c) break;
      const disposition = form["disposition"] ?? "";
      let balance: number | null = null;
      if (
        disposition.toLowerCase().includes("limited by cost") ||
        disposition.toLowerCase().includes("no money")
      ) {
        try {
          balance = Number((await zadarmaBalance(creds)).balance);
        } catch {
          balance = null;
        }
      }
      const r = mapDisposition(disposition, c.direction as "inbound" | "outbound", balance);
      const duration = Number(form["duration"] ?? 0) || null;
      await db
        .from("calls")
        .update({
          status: r.status,
          disposition,
          disposition_reason: r.reason,
          hangup_cause: form["status_code"] ?? null,
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          billseconds: r.status === "completed" ? duration : 0,
          answered_at: c.answered_at ?? (r.status === "completed" ? started : null),
          ...(form["is_recorded"] === "1" ? { recording_status: "pending" } : {}),
          metadata: { ...((c.metadata as object) ?? {}), balance_at_end: balance, zadarma: form },
        })
        .eq("id", c.id);
      await afterCallEnded(c.id);
      break;
    }
    case "NOTIFY_RECORD": {
      const c = await findCall();
      if (c) {
        await db
          .from("calls")
          .update({
            recording_status: "pending",
            metadata: {
              ...((c.metadata as object) ?? {}),
              call_id_with_rec: form["call_id_with_rec"],
            },
          })
          .eq("id", c.id);
        await db.rpc("enqueue_job", {
          _account: accountId,
          _kind: "call.process",
          _payload: { call_id: c.id },
          _dedupe: `call.process:${c.id}`,
        });
      }
      break;
    }
    case "NOTIFY_IVR":
      break;
    default:
      return json({ ok: true, ignored: event });
  }
  return json({ ok: true });
}

// SMS recebido (event=SMS): entra na Caixa pelo canal SMS da Zadarma desta conta. O canal certo é
// o do número que recebeu (caller_did); sem ele, o único canal SMS da conta.
async function ingestZadarmaSms(accountId: string, result: string): Promise<Response> {
  const { parseZadarmaSmsResult, normalizeZadarmaSms } =
    await import("@/backend/providers/zadarma-sms");
  const sms = parseZadarmaSmsResult(result);
  if (!sms) throw new HttpError(400, "SMS sem remetente ou sem texto", "bad_sms");
  const { data: list } = await admin()
    .from("channels")
    .select("id, account_id, provider, platform, name, owner_user_id, external_id")
    .eq("account_id", accountId)
    .eq("provider", "zadarma")
    .eq("platform", "sms")
    .eq("status", "connected");
  const channels = list ?? [];
  const ch =
    channels.find((c) => c.external_id === sms.to) ?? (channels.length === 1 ? channels[0] : null);
  if (!ch) return json({ ok: true, ignored: "sem canal SMS da Zadarma para este número" });
  const ingest = await import("@/backend/providers/zernio-ingest.server");
  await ingest.ingestMessage(ch, normalizeZadarmaSms(result, sms, Date.now()), null);
  return json({ ok: true });
}
