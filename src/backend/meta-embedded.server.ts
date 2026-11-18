// WhatsApp oficial em 1 clique (Cadastro Incorporado da Meta). O app da Meta é da plataforma: o
// cliente autoriza no pop-up da Meta, o front devolve o code + phone_number_id + waba_id e aqui
// trocamos pelo token de negócio, inscrevemos o app na WABA, registramos o número e criamos o canal
// do mesmo jeito que a conexão manual (edge function channels, meta.connect).
import { HttpError, admin } from "@/backend/http.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface PlatformMeta {
  app_id: string | null;
  config_id: string | null;
  app_secret: string | null;
  verify_token: string | null;
}

export async function platformMeta(): Promise<PlatformMeta> {
  const { data, error } = await admin().rpc("platform_meta");
  if (error) throw new HttpError(503, "Configuração da Meta indisponível", "meta_config");
  return data as unknown as PlatformMeta;
}

export function isEmbeddedReady(m: PlatformMeta): boolean {
  return Boolean(m.app_id && m.config_id && m.app_secret);
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok)
    throw new HttpError(400, `A Meta recusou: ${j.error?.message ?? res.status}`, "meta");
  return j;
}

function bearer(token: string, body?: unknown): RequestInit {
  return {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function setChannelSecret(accountId: string, channelId: string, key: string, value: string) {
  const { error } = await admin().rpc("secret_set", {
    _account: accountId,
    _scope: "channel",
    _scope_id: channelId,
    _key: key,
    _value: value,
  });
  if (error) throw new HttpError(500, "Não foi possível guardar a credencial", "vault");
}

export interface EmbeddedInput {
  code?: string;
  phoneNumberId?: string;
  wabaId?: string;
  name?: string;
}

export async function connectEmbedded(accountId: string, b: EmbeddedInput) {
  const m = await platformMeta();
  if (!isEmbeddedReady(m))
    throw new HttpError(
      412,
      "O cadastro em 1 clique ainda não foi ativado na plataforma",
      "not_ready",
    );
  const code = String(b.code ?? "").trim();
  const phoneNumberId = String(b.phoneNumberId ?? "").trim();
  const wabaId = String(b.wabaId ?? "").trim();
  if (
    !code ||
    code.length > 2000 ||
    !/^\d{6,20}$/.test(phoneNumberId) ||
    !/^\d{6,20}$/.test(wabaId)
  )
    throw new HttpError(400, "A Meta não devolveu o número e a conta do WhatsApp", "bad_input");

  const { access_token: token } = await graph<{ access_token: string }>(
    `/oauth/access_token?client_id=${m.app_id}&client_secret=${encodeURIComponent(m.app_secret!)}&code=${encodeURIComponent(code)}`,
  );
  const info = await graph<{ verified_name?: string; display_phone_number?: string }>(
    `/${phoneNumberId}?fields=verified_name,display_phone_number`,
    bearer(token),
  );

  const db = admin();
  const { data: taken } = await db
    .from("channels")
    .select("account_id")
    .eq("provider", "whatsapp_cloud")
    .eq("external_id", phoneNumberId)
    .maybeSingle();
  if (taken && taken.account_id !== accountId)
    throw new HttpError(409, "Número já conectado em outra conta", "taken");

  await graph(`/${wabaId}/subscribed_apps`, bearer(token, {}));
  // número novo na Cloud API precisa ser registrado com um PIN de 2 etapas; se já estava, a Meta recusa
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const registered = await graph(
    `/${phoneNumberId}/register`,
    bearer(token, { messaging_product: "whatsapp", pin }),
  )
    .then(() => true)
    .catch(() => false);

  const { data: ch, error } = await db
    .from("channels")
    .upsert(
      {
        account_id: accountId,
        provider: "whatsapp_cloud",
        platform: "whatsapp",
        external_id: phoneNumberId,
        name: String(b.name ?? "").slice(0, 80) || info.verified_name || "WhatsApp oficial",
        handle: info.display_phone_number ?? null,
        status: "connected",
        config: { waba_id: wabaId, onboarding: "embedded_signup" },
      },
      { onConflict: "provider,external_id" },
    )
    .select("id")
    .single();
  if (error || !ch) throw new HttpError(400, error?.message ?? "Canal não criado", "channel");
  await setChannelSecret(accountId, ch.id, "access_token", token);
  // o webhook do app da plataforma assina com o App Secret dela; o canal guarda o mesmo
  await setChannelSecret(accountId, ch.id, "app_secret", m.app_secret!);
  if (registered) await setChannelSecret(accountId, ch.id, "two_step_pin", pin);
  return {
    ok: true,
    channelId: ch.id,
    name: info.verified_name ?? null,
    phone: info.display_phone_number ?? null,
  };
}

/** Canal do número citado no evento (o webhook do app é um só para todos os clientes). */
export async function channelsForPhones(phoneIds: string[]) {
  if (!phoneIds.length) return [];
  const { data } = await admin()
    .from("channels")
    .select("id, external_id")
    .eq("provider", "whatsapp_cloud")
    .in("external_id", phoneIds);
  return data ?? [];
}
