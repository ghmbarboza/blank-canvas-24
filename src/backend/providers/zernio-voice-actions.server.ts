// Ações de voz da Zernio pela rota /api/zernio: destino das ligações do número, ligação pelo
// WhatsApp, permissão do cliente, softphone do navegador e saúde dos números de saída.
import { callToken, validCallToken } from "@/backend/call-token";
import { HttpError, admin, isUuid, rateLimit, serverSigningKey } from "@/backend/http.server";
import { assertCanCall } from "@/backend/telephony/core.server";
import {
  assessNumberHealth,
  buildForwardTo,
  businessHoursWindows,
  isOutsideWindow,
  participantId,
  type ForwardChoice,
  type HoursChoice,
  type NumberHealthRow,
} from "@/features/channels/zernio-rules";
import { toE164 } from "@/features/telephony/lib";

import { asHttp } from "./zernio-actions.server";
import { requireZernioKey } from "./zernio-client.server";
import {
  callPermission,
  callingConfig,
  endCall,
  requestCallPermission,
  setVoice,
  setWhatsAppCalling,
  startWhatsAppCall,
  transferCall,
  webDial,
  webSession,
} from "./zernio-voice.server";

const MAX_GREETING = 400;

export interface VoiceInput {
  numberId?: string;
  forward?: ForwardChoice;
  hours?: HoursChoice;
  voicemail?: boolean;
  greeting?: string;
  recording?: boolean;
  transcription?: boolean;
}

function forwardOrThrow(choice: ForwardChoice | undefined): string {
  const r = buildForwardTo(choice ?? { kind: "none" });
  if (!r.ok) throw new HttpError(400, r.error, "bad_forward");
  return r.value;
}

/** Destino, horário, caixa postal e gravação do número real (POST /phone-numbers/{id}/voice). */
export async function saveVoice(accountId: string, p: VoiceInput) {
  const db = admin();
  const { data: num } = await db
    .from("zernio_numbers")
    .select("id, zernio_number_id")
    .eq("account_id", accountId)
    .eq("id", String(p.numberId ?? ""))
    .maybeSingle();
  if (!num) throw new HttpError(404, "Número não encontrado", "no_number");
  const forwardTo = forwardOrThrow(p.forward);
  let windows: { day: number; open: string; close: string }[] = [];
  try {
    windows = p.hours ? businessHoursWindows(p.hours) : [];
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Horário inválido", "bad_hours");
  }
  const greeting = (p.greeting ?? "").trim().slice(0, MAX_GREETING);
  try {
    const key = await requireZernioKey(accountId);
    const effective = await setVoice(key, num.zernio_number_id, {
      forwardTo,
      voicemailEnabled: p.voicemail !== false,
      voicemailGreeting: greeting,
      businessHoursEnabled: Boolean(p.hours?.enabled && windows.length),
      ...(p.hours?.enabled && windows.length
        ? { businessHoursTimezone: p.hours.timezone || "America/Sao_Paulo", businessHours: windows }
        : {}),
      // A Zernio toca o aviso de gravação antes de gravar; nunca grava em silêncio.
      recordingEnabled: Boolean(p.recording),
      transcriptionEnabled: Boolean(p.transcription),
      transcriptionLanguage: "auto",
    });
    await db
      .from("zernio_numbers")
      .update({ voice: { ...p, forwardTo, savedAt: new Date().toISOString() } as never })
      .eq("id", num.id)
      .eq("account_id", accountId);
    return { ok: true, effective };
  } catch (err) {
    asHttp(err);
  }
}

async function zernioChannel(accountId: string, channelId: unknown) {
  const { data: ch } = await admin()
    .from("channels")
    .select("id, provider, platform, external_id, config")
    .eq("account_id", accountId)
    .eq("id", String(channelId ?? ""))
    .maybeSingle();
  if (!ch || ch.provider !== "zernio" || ch.platform !== "whatsapp" || !ch.external_id)
    throw new HttpError(404, "WhatsApp da Zernio não encontrado", "no_channel");
  return {
    ...ch,
    external_id: ch.external_id,
    config: (ch.config ?? {}) as Record<string, unknown>,
  };
}

export async function getCalling(accountId: string, channelId: unknown) {
  const ch = await zernioChannel(accountId, channelId);
  try {
    const key = await requireZernioKey(accountId);
    const cfg = await callingConfig(key, ch.external_id);
    return { ...cfg, coexistence: ch.config["coexistence"] === true };
  } catch (err) {
    asHttp(err);
  }
}

/** Liga a ligação pelo WhatsApp e escolhe para onde ela toca. */
export async function saveCalling(
  accountId: string,
  p: { channelId?: string; forward?: ForwardChoice; recording?: boolean; maxMinutes?: number },
) {
  const ch = await zernioChannel(accountId, p.channelId);
  if (ch.config["coexistence"] === true)
    throw new HttpError(
      409,
      "Número no app do celular (coexistência) não recebe ligação pela API. Conecte só pela API para ligar.",
      "coexistence",
    );
  const forwardTo = forwardOrThrow(p.forward);
  if (!forwardTo) throw new HttpError(400, "Escolha para onde a ligação vai", "no_forward");
  const maxSeconds =
    p.maxMinutes && p.maxMinutes > 0 ? Math.min(240, Math.round(p.maxMinutes)) * 60 : undefined;
  try {
    const key = await requireZernioKey(accountId);
    const cfg = await callingConfig(key, ch.external_id);
    if (!cfg.phoneNumberDocId)
      throw new HttpError(409, "A Zernio ainda não liberou ligação neste número", "no_doc");
    const r = await setWhatsAppCalling(key, cfg.phoneNumberDocId, {
      zernioAccountId: ch.external_id,
      forwardTo,
      recordingEnabled: Boolean(p.recording),
      ...(maxSeconds ? { maxCallDurationSeconds: maxSeconds } : {}),
      firstTime: !cfg.callingEnabled,
    });
    await admin()
      .from("channels")
      .update({
        config: {
          ...ch.config,
          calling: { forwardTo, recording: Boolean(p.recording), maxSeconds: maxSeconds ?? null },
        } as never,
      })
      .eq("id", ch.id)
      .eq("account_id", accountId);
    return { ok: true, callingEnabled: r.callingEnabled ?? true };
  } catch (err) {
    asHttp(err);
  }
}

async function contactTarget(accountId: string, contactId: unknown) {
  const { data: c } = await admin()
    .from("contacts")
    .select("id, name, phone")
    .eq("account_id", accountId)
    .eq("id", String(contactId ?? ""))
    .maybeSingle();
  const to = participantId(c?.phone ?? null);
  if (!c || !to) throw new HttpError(400, "O contato precisa de telefone com DDD", "no_phone");
  return { contact: c, to };
}

/** Pede ao cliente, pelo WhatsApp, permissão para a empresa ligar. 1 por dia e 2 por semana (Meta). */
export async function askPermission(
  accountId: string,
  userId: string,
  p: { channelId?: string; contactId?: string; text?: string },
) {
  const ch = await zernioChannel(accountId, p.channelId);
  const { contact, to } = await contactTarget(accountId, p.contactId);
  const db = admin();
  try {
    const key = await requireZernioKey(accountId);
    const st = await callPermission(key, ch.external_id, `+${to}`);
    const canCall =
      st.actions?.some((a) => a.action_name === "start_call" && a.can_perform_action) ?? false;
    if (canCall) {
      await db.from("zernio_call_permissions").upsert(
        {
          account_id: accountId,
          channel_id: ch.id,
          phone: to,
          contact_id: contact.id,
          status: "granted",
          is_permanent: st.permission?.status === "permanent",
          expires_at: st.permission?.expiration_time
            ? new Date(st.permission.expiration_time * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id,channel_id,phone" },
      );
      return { status: "granted" as const };
    }
    const { data: conv } = await db
      .from("conversations")
      .select("last_inbound_at")
      .eq("channel_id", ch.id)
      .eq("contact_id", contact.id)
      .order("last_inbound_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (isOutsideWindow(conv?.last_inbound_at ?? null))
      throw new HttpError(
        409,
        "O pedido de permissão só sai com a conversa aberta (cliente escreveu nas últimas 24 h).",
        "window_closed",
      );
    await rateLimit(
      `zernio:perm:${accountId}:${to}`,
      1,
      24 * 3600,
      "Já pedimos a permissão hoje. O WhatsApp libera 1 pedido por dia.",
    );
    const text = (p.text ?? "").trim() || "Podemos te ligar por aqui para resolver mais rápido?";
    await requestCallPermission(key, ch.external_id, `+${to}`, text);
    await db.from("zernio_call_permissions").upsert(
      {
        account_id: accountId,
        channel_id: ch.id,
        phone: to,
        contact_id: contact.id,
        status: "requested",
        requested_at: new Date().toISOString(),
        requested_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,channel_id,phone" },
    );
    return { status: "requested" as const };
  } catch (err) {
    asHttp(err);
  }
}

/** Liga para o cliente pelo WhatsApp (precisa da permissão dele). O minuto é cobrado pela Meta. */
export async function callOnWhatsApp(
  accountId: string,
  userId: string,
  p: { channelId?: string; contactId?: string },
) {
  const ch = await zernioChannel(accountId, p.channelId);
  const { contact, to } = await contactTarget(accountId, p.contactId);
  // Lista "não ligar", horário de silêncio e consentimento valem também pela Zernio (S4).
  await assertCanCall(accountId, contact.id, `+${to}`);
  await rateLimit(`zernio:wacall:${accountId}`, 30, 3600);
  try {
    const key = await requireZernioKey(accountId);
    const r = await startWhatsAppCall(key, ch.external_id, `+${to}`);
    return withCallToken(userId, r.callId ?? null, r.status ?? "dialing");
  } catch (err) {
    asHttp(err);
  }
}

// ------------------------------------------------------------------ softphone

export async function webCallSession(accountId: string, userId: string) {
  await rateLimit(`zernio:web:${userId}`, 20, 3600);
  try {
    const key = await requireZernioKey(accountId);
    const s = await webSession(key);
    return { token: s.token, credentialId: s.credentialId, expiresAt: s.expiresAt ?? null };
  } catch (err) {
    asHttp(err);
  }
}

export async function webCallDial(
  accountId: string,
  userId: string,
  p: { credentialId?: string; to?: string; fromNumber?: string; contactId?: string },
) {
  const to = toE164(p.to);
  if (!to) throw new HttpError(400, "Número inválido", "bad_phone");
  if (!p.credentialId || !/^[A-Za-z0-9-]{8,80}$/.test(p.credentialId))
    throw new HttpError(400, "Sessão do softphone inválida", "bad_session");
  const from = p.fromNumber ? toE164(p.fromNumber) : null;
  // Mesma trava da Zadarma: lista "não ligar", silêncio e regras de discagem (S4).
  await assertCanCall(accountId, isUuid(p.contactId) ? p.contactId : null, to);
  await rateLimit(`zernio:dial:${accountId}`, 60, 3600, "Limite de 60 ligações por hora atingido");
  try {
    const key = await requireZernioKey(accountId);
    const r = await webDial(key, p.credentialId, to, from ?? undefined);
    return withCallToken(userId, r.callId ?? null, r.status ?? "dialing");
  } catch (err) {
    asHttp(err);
  }
}

async function withCallToken(userId: string, callId: string | null, status: string) {
  const callToken_ = callId ? callToken(await serverSigningKey(), userId, callId) : null;
  return { callId, status, callToken: callToken_ };
}

/** Encerra a ligação: quem discou (com o token devolvido na discagem) ou um gestor (S10). */
export async function hangUp(
  accountId: string,
  zernioCallId: unknown,
  who: { userId: string; isManager: boolean; callToken?: unknown },
) {
  const id = String(zernioCallId ?? "");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new HttpError(400, "Ligação inválida", "bad_call");
  if (!who.isManager && !validCallToken(await serverSigningKey(), who.userId, id, who.callToken))
    throw new HttpError(403, "Só quem fez a ligação ou um gestor pode encerrá-la", "forbidden");
  try {
    await endCall(await requireZernioKey(accountId), id);
    return { ok: true };
  } catch (err) {
    asHttp(err);
  }
}

export async function transfer(accountId: string, p: { zernioCallId?: string; to?: string }) {
  const id = String(p.zernioCallId ?? "");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new HttpError(400, "Ligação inválida", "bad_call");
  const to = p.to?.startsWith("sip:") ? p.to : toE164(p.to);
  if (!to) throw new HttpError(400, "Destino inválido", "bad_target");
  try {
    await transferCall(await requireZernioKey(accountId), id, to);
    return { ok: true };
  } catch (err) {
    asHttp(err);
  }
}

// ------------------------------------------------------------------ saúde

export async function numberHealth(accountId: string, hours = 24) {
  const { data, error } = await admin().rpc("outbound_number_health", {
    _account: accountId,
    _hours: hours,
  });
  if (error) throw new HttpError(500, "Não deu para calcular a saúde dos números", "health");
  return (data ?? []).map((r) => {
    const row: NumberHealthRow = {
      number: r.number,
      calls_last_hour: r.calls_last_hour,
      calls_total: r.calls_total,
      answered: r.answered,
      short_calls: r.short_calls,
      avg_duration_seconds: r.avg_duration_seconds === null ? null : Number(r.avg_duration_seconds),
    };
    return { ...row, verdict: assessNumberHealth(row) };
  });
}
