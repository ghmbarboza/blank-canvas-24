// Envio de SMS pela Zadarma a partir de um canal SMS da Caixa (provider "zadarma", platform "sms").
// Tudo vale no servidor, para qualquer caminho (equipe, agente de IA, sistema):
// - o canal precisa estar conectado;
// - a conversa precisa de contato e o can_contact tem que dizer sim (erro na consulta = não envia);
// - o SMS vai para o telefone do contato, o mesmo endereço que o consentimento conferiu;
// - teto diário por conta (padrão 300, ajustável em Ajustes › Integrações › Zadarma).
import { HttpError, admin, rateLimit } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import { zadarmaCreds } from "@/backend/telephony/core.server";
import { toE164 } from "@/features/telephony/lib";

import { smsDailyCap } from "./zadarma-sms";
import { zadarmaSms } from "./zadarma.server";

export interface SmsChannel {
  id: string;
  external_id: string;
  config: Record<string, string> | null;
}

export async function sendZadarmaSms(
  accountId: string,
  ch: SmsChannel,
  _to: string,
  text: string,
  contactId: string | null,
): Promise<string | null> {
  const db = admin();
  const { data: live } = await db
    .from("channels")
    .select("status")
    .eq("id", ch.id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (live?.status !== "connected")
    throw new HttpError(409, "O canal de SMS está desconectado. Confira em Canais.", "channel_off");
  if (!contactId)
    throw new HttpError(
      409,
      "Esta conversa não tem contato: sem ele não dá para conferir a autorização de SMS",
      "no_contact",
    );
  const { data: ok, error: consentError } = await db.rpc("can_contact", {
    _contact: contactId,
    _channel: "sms",
  });
  if (consentError)
    throw new HttpError(
      503,
      "Não deu para conferir a autorização de SMS. Tente de novo.",
      "consent",
    );
  if (ok !== true) throw new HttpError(403, "O contato não autorizou SMS", "no_consent");
  const { data: contact } = await db
    .from("contacts")
    .select("phone")
    .eq("id", contactId)
    .eq("account_id", accountId)
    .maybeSingle();
  const e164 = toE164(contact?.phone ?? null);
  if (!e164) throw new HttpError(409, "O contato não tem telefone válido para SMS", "no_phone");

  const it = await getIntegration(accountId, "zadarma");
  const cap = smsDailyCap(it?.config["sms_daily_cap"]);
  await rateLimit(
    `sms:conta:${accountId}`,
    cap,
    86_400,
    `Limite de ${cap} SMS por dia desta conta atingido. O dono pode mudar em Ajustes › Integrações › Zadarma.`,
  );

  const sender = (ch.config?.["sender"] ?? ch.external_id ?? "").replace(/\D/g, "");
  const creds = await zadarmaCreds(accountId);
  const r = await zadarmaSms(creds, e164.replace("+", ""), text.slice(0, 600), sender || undefined);
  const denied = r.denied_numbers?.[0];
  if (denied) throw new Error(`A Zadarma recusou o SMS: ${denied.message}`);
  await db.from("usage_ledger").insert({
    account_id: accountId,
    kind: "sms",
    quantity: 1,
    unit: "un",
    ref_table: "contacts",
    ref_id: contactId,
  });
  // a Zadarma não devolve id da mensagem
  return null;
}
