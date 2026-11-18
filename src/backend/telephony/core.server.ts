// Núcleo de telefonia no servidor: credenciais da conta (sem recuo para chave de outra conta),
// contato pelo número, travas de envio e encerramento da ligação.
import { HttpError, admin } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import { assertDialingRules } from "@/backend/routing/dialing.server";
import type { ZadarmaCreds } from "@/backend/providers/zadarma.server";
import { inQuietHours, outboundGuard, phoneKey, toE164 } from "@/features/telephony/lib";

// Uma conta Zadarma por cliente: nunca usar credencial de outra conta nem de ambiente global.
export async function zadarmaCreds(accountId: string): Promise<ZadarmaCreds> {
  const it = await getIntegration(accountId, "zadarma");
  const key = it?.secrets["api_key"];
  const secret = it?.secrets["api_secret"];
  if (!key || !secret)
    throw new HttpError(
      412,
      "Conecte a Zadarma em Ajustes › Integrações para ligar",
      "zadarma_off",
    );
  return { key, secret };
}

export async function elevenKey(accountId: string): Promise<string> {
  const it = await getIntegration(accountId, "elevenlabs");
  const key = it?.secrets["api_key"];
  if (!key)
    throw new HttpError(
      412,
      "Conecte a ElevenLabs em Ajustes › Integrações para usar a voz com IA",
      "eleven_off",
    );
  return key;
}

export interface TelephonySettings {
  balance_threshold_calls: number;
  avg_call_cost_usd: number;
  record_calls: boolean;
  coach_enabled: boolean;
  last_balance_alert_at?: string | null;
}

export const DEFAULT_TELEPHONY: TelephonySettings = {
  balance_threshold_calls: 20,
  avg_call_cost_usd: 0.25,
  record_calls: true,
  coach_enabled: true,
};

export async function accountContext(accountId: string) {
  const { data } = await admin()
    .from("accounts")
    .select("name, timezone, settings")
    .eq("id", accountId)
    .single();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const privacy = (settings["privacy"] ?? {}) as {
    quiet_hours_start?: string;
    quiet_hours_end?: string;
    recording_notice?: string;
  };
  return {
    name: data?.name ?? "",
    timezone: data?.timezone || "America/Sao_Paulo",
    telephony: {
      ...DEFAULT_TELEPHONY,
      ...((settings["telephony"] ?? {}) as Partial<TelephonySettings>),
    },
    quietStart: privacy.quiet_hours_start ?? "21:00",
    quietEnd: privacy.quiet_hours_end ?? "08:00",
    recordingNotice:
      privacy.recording_notice ??
      "Esta ligação pode ser gravada e transcrita para fins de qualidade.",
    settings,
  };
}

// Contato pelo número: casa pelos últimos 8 dígitos e confere o número inteiro quando dá.
export async function findContactByPhone(accountId: string, raw: string | null | undefined) {
  const key = phoneKey(raw);
  if (key.length < 8) return null;
  const { data } = await admin()
    .from("contacts")
    .select(
      "id, name, phone, owner_user_id, email, score, temperature, lifecycle, ai_summary, ai_next_step, company",
    )
    .eq("account_id", accountId)
    .ilike("phone", `%${key}`)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(5);
  const full = toE164(raw)?.replace("+", "") ?? "";
  return (
    (data ?? []).find((c) => (c.phone ?? "").replace(/\D/g, "").endsWith(full.slice(-10))) ??
    data?.[0] ??
    null
  );
}

// Antes de qualquer ligação de saída: supressão (DNC), horário de silêncio e a trava da Anatel.
export async function assertCanCall(
  accountId: string,
  contactId: string | null,
  phone: string,
): Promise<void> {
  const db = admin();
  // Regras de discagem que a empresa ligou em Fila e roteamento (todas desligadas por padrão).
  await assertDialingRules(accountId, phone);
  const ctx = await accountContext(accountId);
  if (inQuietHours(new Date(), ctx.timezone, ctx.quietStart, ctx.quietEnd))
    throw new HttpError(
      409,
      `Fora do horário permitido para ligar (silêncio das ${ctx.quietStart} às ${ctx.quietEnd})`,
      "quiet_hours",
    );
  const d = phone.replace(/\D/g, "");
  const { data: supp } = await db
    .from("suppressions")
    .select("reason")
    .eq("account_id", accountId)
    .eq("channel", "voice")
    .in("address", [d, d.replace(/^55/, ""), `+${d}`])
    .limit(1);
  if (supp && supp.length)
    throw new HttpError(409, "Este número pediu para não receber ligações", "dnc");
  // Contato de outra conta não conta: o consentimento lido é sempre o desta conta (R13).
  const { data: own } = contactId
    ? await db
        .from("contacts")
        .select("id")
        .eq("id", contactId)
        .eq("account_id", accountId)
        .maybeSingle()
    : { data: null };
  if (contactId && !own) throw new HttpError(404, "Contato não encontrado", "not_found");
  if (own) {
    const { data: ok } = await db.rpc("can_contact", { _contact: own.id, _channel: "voice" });
    if (ok === false) throw new HttpError(409, "Este contato não autorizou ligações", "no_consent");
  }
  const { data: recent } = await db
    .from("calls")
    .select("started_at, answered_at, billseconds")
    .eq("account_id", accountId)
    .eq("direction", "outbound")
    .ilike("to_number", `%${phoneKey(phone)}`)
    .gte("started_at", new Date(Date.now() - 86_400_000).toISOString());
  const g = outboundGuard(recent ?? []);
  if (!g.ok) throw new HttpError(409, g.reason ?? "Bloqueado", "anatel_guard");
}

export async function recordOptOut(accountId: string, phone: string | null, source: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return;
  await admin()
    .from("suppressions")
    .upsert(
      { account_id: accountId, channel: "voice", address: d, reason: "optout_spoken", source },
      { onConflict: "account_id,channel,address", ignoreDuplicates: true },
    );
}

// Encerramento comum (Zadarma ou ElevenLabs): atividade na linha do tempo e evento call.ended.
export async function afterCallEnded(callId: string) {
  const db = admin();
  const { data: c } = await db.from("calls").select("*").eq("id", callId).single();
  if (!c) return;
  if (c.contact_id) {
    const title = c.voice_agent_id
      ? "Ligação da IA de voz"
      : c.direction === "inbound"
        ? "Ligação recebida"
        : "Ligação feita";
    await db
      .from("contacts")
      .update({ last_interaction_at: c.ended_at ?? new Date().toISOString() })
      .eq("id", c.contact_id);
    if (c.user_id) {
      await db.from("activities").insert({
        account_id: c.account_id,
        contact_id: c.contact_id,
        type: "call",
        title: `${title}${c.answered_at ? "" : " (não atendida)"}`,
        body: c.summary ?? c.disposition_reason,
        user_id: c.user_id,
        done_at: c.ended_at ?? new Date().toISOString(),
      });
    }
  }
  await db.rpc("emit_event", {
    _account: c.account_id,
    _type: "call.ended",
    _entity: "call",
    _entity_id: c.id,
    _payload: {
      contact_id: c.contact_id,
      direction: c.direction,
      status: c.status,
      duration_seconds: c.billseconds ?? c.duration_seconds,
      voice_agent_id: c.voice_agent_id,
      campaign_id: c.campaign_id,
    },
  });
  if (c.billseconds || c.duration_seconds) {
    await db.from("usage_ledger").insert({
      account_id: c.account_id,
      kind: c.voice_agent_id ? "voice_ai_min" : "phone_min",
      quantity: Math.ceil((c.billseconds ?? c.duration_seconds ?? 0) / 60),
      unit: "min",
      cost_usd: c.cost_usd ?? 0,
      ref_table: "calls",
      ref_id: c.id,
    });
  }
}
