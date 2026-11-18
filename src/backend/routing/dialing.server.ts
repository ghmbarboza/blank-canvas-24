// Regras de discagem configuráveis pelo cliente (padrão desligado). Chamado antes de toda ligação
// de saída (clicar para ligar, discador, campanha de voz). Ligar ou não cada regra é decisão e
// responsabilidade da empresa cliente; a Central de CS só aplica o que ela escolheu.
import { HttpError, admin } from "@/backend/http.server";
import { applyDialPrefix, checkDialingRules, parseDialingRules } from "@/features/queue/lib";

export async function assertDialingRules(accountId: string, phone: string): Promise<void> {
  const db = admin();
  const { data: s } = await db
    .from("call_center_settings")
    .select("dialing")
    .eq("account_id", accountId)
    .maybeSingle();
  const rules = parseDialingRules(s?.dialing ?? {});
  if (!rules.window.enabled && !rules.attempts.enabled && !rules.dnc.enabled) return;
  const { data: acc } = await db.from("accounts").select("timezone").eq("id", accountId).single();
  const d = phone.replace(/\D/g, "");
  let attempts = 0;
  if (rules.attempts.enabled) {
    const { data } = await db.rpc("cc_attempts_for", {
      _account: accountId,
      _phone: d,
      _days: rules.attempts.period_days,
    });
    attempts = typeof data === "number" ? data : 0;
  }
  let onDncList = false;
  if (rules.dnc.enabled) {
    const { data } = await db
      .from("suppressions")
      .select("id")
      .eq("account_id", accountId)
      .eq("channel", "voice")
      .in("address", [d, d.replace(/^55/, ""), `+${d}`])
      .limit(1);
    onDncList = Boolean(data?.length);
  }
  const r = checkDialingRules(rules, {
    now: new Date(),
    timeZone: acc?.timezone || "America/Sao_Paulo",
    attempts,
    onDncList,
  });
  if (!r.ok)
    throw new HttpError(409, r.reason ?? "Bloqueado pela regra da empresa", `rule_${r.code}`);
}

/** Número de saída e prefixo da campanha (quando a campanha define). */
export async function campaignDialing(campaignId: string | null | undefined) {
  if (!campaignId) return { prefix: null as string | null, phoneNumberId: null as string | null };
  const { data } = await admin()
    .from("voice_campaigns")
    .select("dial_prefix, phone_number_id")
    .eq("id", campaignId)
    .maybeSingle();
  return { prefix: data?.dial_prefix ?? null, phoneNumberId: data?.phone_number_id ?? null };
}

export { applyDialPrefix };
