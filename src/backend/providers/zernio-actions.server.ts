// Ações de configuração da Zernio pela rota /api/zernio: chave no cofre, webhook, cadastro do
// WhatsApp, sincronização de contas, modelos e números (catálogo, KYC, compra, portabilidade).
import { randomBytes } from "node:crypto";

import { HttpError, admin, appBaseUrl } from "@/backend/http.server";
import { findOption, isServiceChannelPlatform } from "@/features/channels/zernio-catalog";
import { offersFromCountry, portReasonText } from "@/features/channels/zernio-rules";
import { toE164 } from "@/features/telephony/lib";

import {
  ZernioError,
  defaultProfileId,
  listAccounts,
  requireZernioKey,
  socialConnectUrl,
  upsertWebhook,
  whatsappConnectUrl,
  zernio,
  zernioFriendly,
  zernioKey,
} from "./zernio-client.server";
import { ZERNIO_EVENTS, toPlatform } from "./zernio-normalize";
import {
  availability,
  countryCatalog,
  kycShareLink,
  listNumbers,
  portCheck,
  portRequirements,
  purchaseNumber,
} from "./zernio-voice.server";
import { listTemplates } from "./zernio-whatsapp.server";

export function asHttp(err: unknown): never {
  if (err instanceof HttpError) throw err;
  if (err instanceof ZernioError) {
    const status =
      err.status === 401 || err.status === 403 ? 422 : err.status >= 500 ? 502 : err.status;
    throw new HttpError(status, zernioFriendly(err), `zernio_${err.code}`);
  }
  throw err;
}

async function setSecret(accountId: string, key: string, value: string) {
  const { error } = await admin().rpc("secret_set", {
    _account: accountId,
    _scope: "integration",
    _scope_id: accountId,
    _key: key,
    _value: value,
  });
  if (error) throw new HttpError(500, "Não deu para guardar no cofre", "secret");
}

async function webhookSecret(accountId: string): Promise<string> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: "zernio_webhook_secret",
  });
  if (typeof data === "string" && data) return data;
  const fresh = randomBytes(32).toString("hex");
  await setSecret(accountId, "zernio_webhook_secret", fresh);
  return fresh;
}

async function saveStatus(
  accountId: string,
  status: "connected" | "error",
  lastError: string | null,
) {
  await admin()
    .from("account_integrations")
    .upsert(
      { account_id: accountId, provider: "zernio", config: {}, status, last_error: lastError },
      { onConflict: "account_id,provider" },
    );
}

export function webhookUrl(req: Request, accountId: string): string {
  return `${appBaseUrl(req)}/api/public/zernio?a=${accountId}`;
}

/** Salva (ou só confere) a chave, registra o webhook único e marca a integração. */
export async function saveKey(req: Request, accountId: string, apiKey: string | undefined) {
  const key = apiKey?.trim();
  if (key && !/^sk_[A-Za-z0-9]{16,120}$/.test(key))
    throw new HttpError(
      400,
      "A chave da Zernio começa com sk_. Copie de novo no painel da Zernio.",
      "bad_key",
    );
  const effective = key || (await zernioKey(accountId));
  if (!effective) throw new HttpError(400, "Cole a chave da Zernio", "no_key");
  try {
    const accounts = await listAccounts(effective);
    if (key) await setSecret(accountId, "zernio_api_key", key);
    const secret = await webhookSecret(accountId);
    await upsertWebhook(effective, webhookUrl(req, accountId), secret, ZERNIO_EVENTS);
    await saveStatus(accountId, "connected", null);
    return {
      ok: true,
      accounts: accounts.length,
      whatsapp: accounts.filter((a) => a.platform === "whatsapp").length,
    };
  } catch (err) {
    const msg = zernioFriendly(err);
    await saveStatus(accountId, "error", msg.slice(0, 300));
    asHttp(err);
  }
}

/** Teste barato (GET /v1/accounts): a chave abre e quantas contas ela enxerga. */
export async function testKey(accountId: string) {
  try {
    const key = await requireZernioKey(accountId);
    const accounts = await listAccounts(key);
    await saveStatus(accountId, "connected", null);
    const whatsapp = accounts.filter((a) => a.platform === "whatsapp").length;
    return {
      ok: true,
      accounts: accounts.length,
      whatsapp,
      message: `Conexão ok: ${accounts.length} ${accounts.length === 1 ? "conta" : "contas"} na Zernio, ${whatsapp} de WhatsApp.`,
    };
  } catch (err) {
    await saveStatus(accountId, "error", zernioFriendly(err).slice(0, 300));
    asHttp(err);
  }
}

function safeRedirect(req: Request, redirectUrl: unknown): string {
  const base = new URL(appBaseUrl(req));
  try {
    const u = new URL(String(redirectUrl ?? ""));
    if (u.origin === base.origin || u.origin === new URL(req.url).origin) return u.toString();
  } catch {
    // cai no padrão
  }
  return `${base.origin}/canais`;
}

export async function whatsappConnect(
  req: Request,
  accountId: string,
  p: { coexistence?: boolean; redirectUrl?: string },
) {
  try {
    const key = await requireZernioKey(accountId);
    const profileId = await defaultProfileId(key);
    if (!profileId)
      throw new HttpError(412, "Crie um perfil no painel da Zernio primeiro", "no_profile");
    const { data: acc } = await admin()
      .from("accounts")
      .select("name")
      .eq("id", accountId)
      .maybeSingle();
    const redirect = new URL(safeRedirect(req, p.redirectUrl));
    redirect.searchParams.set("zernio", "whatsapp");
    redirect.searchParams.set("coex", p.coexistence ? "1" : "0");
    const url = await whatsappConnectUrl(key, {
      profileId,
      redirectUrl: redirect.toString(),
      coexistence: Boolean(p.coexistence),
      brandName: acc?.name ?? undefined,
    });
    return { url };
  } catch (err) {
    asHttp(err);
  }
}

export async function socialConnect(
  req: Request,
  accountId: string,
  p: { platform?: string; redirectUrl?: string },
) {
  const platform = String(p.platform ?? "");
  if (!/^[a-z]{2,20}$/.test(platform)) throw new HttpError(400, "Rede inválida", "bad_platform");
  try {
    const key = await requireZernioKey(accountId);
    const profileId = await defaultProfileId(key);
    if (!profileId)
      throw new HttpError(412, "Crie um perfil no painel da Zernio primeiro", "no_profile");
    return {
      url: await socialConnectUrl(key, platform, profileId, safeRedirect(req, p.redirectUrl)),
    };
  } catch (err) {
    asHttp(err);
  }
}

/** Puxa as contas da Zernio para `channels`; a de WhatsApp guarda se é coexistência. */
export async function syncAccounts(
  accountId: string,
  hint?: { zernioAccountId?: string; coexistence?: boolean },
) {
  try {
    const key = await requireZernioKey(accountId);
    const accounts = await listAccounts(key);
    const db = admin();
    const ids = accounts.map((a) => a._id);
    const { data: taken } = ids.length
      ? await db
          .from("channels")
          .select("external_id")
          .eq("provider", "zernio")
          .neq("account_id", accountId)
          .in("external_id", ids)
      : { data: [] as { external_id: string | null }[] };
    const takenIds = new Set((taken ?? []).map((t) => t.external_id));
    let synced = 0;
    for (const a of accounts) {
      if (takenIds.has(a._id)) continue;
      // conta de anúncio (metaads, googleads…) e caixa de agenda/e-mail (google, microsoft) não
      // são canal de atendimento: ficam só na Central da Zernio
      if (!isServiceChannelPlatform(a.platform)) continue;
      const platform = toPlatform(a.platform);
      const row: Record<string, unknown> = {
        account_id: accountId,
        provider: "zernio",
        platform,
        external_id: a._id,
        name: (a.displayName ?? a.username ?? platform).slice(0, 80),
        handle:
          platform === "whatsapp" ? (a.username ?? null) : a.username ? `@${a.username}` : null,
        status: a.isActive === false ? "disconnected" : "connected",
      };
      if (hint?.zernioAccountId === a._id)
        row["config"] = { coexistence: Boolean(hint.coexistence) };
      const { error } = await db
        .from("channels")
        .upsert(row as never, { onConflict: "provider,external_id" });
      if (!error) synced++;
    }
    return { ok: true, synced, found: accounts.length };
  } catch (err) {
    asHttp(err);
  }
}

export async function listChannelTemplates(accountId: string, channelId: string) {
  const { data: ch } = await admin()
    .from("channels")
    .select("provider, platform, external_id")
    .eq("id", channelId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!ch || ch.provider !== "zernio" || ch.platform !== "whatsapp" || !ch.external_id) return null;
  const key = await requireZernioKey(accountId);
  return listTemplates(key, ch.external_id);
}

// ------------------------------------------------------------------ números

export async function numberCatalog(accountId: string, country: string) {
  const code = /^[A-Z]{2}$/.test(country) ? country : "BR";
  try {
    const catalog = await countryCatalog(code);
    const key = await zernioKey(accountId);
    const areas = key ? await availability(key, code, "local").catch(() => null) : null;
    return {
      country: code,
      offers: offersFromCountry(catalog),
      areas: (areas?.areaOptions ?? []).map((a) => ({ ndc: a.ndc, name: a.name })),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    asHttp(err);
  }
}

/** Sincroniza os números da conta Zernio com `zernio_numbers` e devolve a lista. */
export async function syncNumbers(accountId: string) {
  try {
    const key = await requireZernioKey(accountId);
    const r = await listNumbers(key);
    const db = admin();
    for (const n of r.numbers ?? []) {
      const id = n._id ?? n.id;
      if (!id) continue;
      await db.from("zernio_numbers").upsert(
        {
          account_id: accountId,
          zernio_number_id: id,
          source: "purchase",
          phone_number: n.phoneNumber ?? null,
          country: n.country ?? null,
          status: n.status ?? "pending",
          monthly_cents: n.monthlyCents ?? null,
          profile_id: n.profileId ?? null,
          verification_url: n.onfidoVerificationUrl ?? null,
        } as never,
        { onConflict: "account_id,zernio_number_id" },
      );
    }
    const { data } = await db
      .from("zernio_numbers")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at");
    return { numbers: data ?? [], connected: (r.connected ?? []).length };
  } catch (err) {
    asHttp(err);
  }
}

const NUMBER_TYPES = ["local", "mobile", "national", "toll_free"];

export async function kycLink(
  req: Request,
  accountId: string,
  p: { numberType?: string; areaCode?: string },
) {
  const numberType = NUMBER_TYPES.includes(String(p.numberType)) ? String(p.numberType) : "local";
  const areaCode = p.areaCode && /^\d{1,4}$/.test(p.areaCode) ? p.areaCode : undefined;
  try {
    const key = await requireZernioKey(accountId);
    const profileId = await defaultProfileId(key);
    if (!profileId)
      throw new HttpError(412, "Crie um perfil no painel da Zernio primeiro", "no_profile");
    const { data: acc } = await admin()
      .from("accounts")
      .select("name")
      .eq("id", accountId)
      .maybeSingle();
    const r = await kycShareLink(key, {
      profileId,
      country: "BR",
      numberType,
      ...(areaCode ? { areaCode } : {}),
      redirectUrl: `${appBaseUrl(req)}/canais?zernio=kyc`,
      ...(acc?.name ? { companyName: acc.name } : {}),
    });
    return { url: r.url, expiresAt: r.expiresAt ?? null };
  } catch (err) {
    asHttp(err);
  }
}

/** Compra de número: gasta. Exige `confirm: true` e uma chave de intenção para não comprar dois. */
export async function purchase(
  accountId: string,
  p: { numberType?: string; areaCode?: string; confirm?: boolean; intentId?: string },
) {
  if (p.confirm !== true)
    throw new HttpError(400, "Confirme a compra na tela antes", "confirm_required");
  const intent = String(p.intentId ?? "");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(intent))
    throw new HttpError(400, "Pedido de compra inválido", "bad_intent");
  const numberType = NUMBER_TYPES.includes(String(p.numberType)) ? String(p.numberType) : "local";
  try {
    const key = await requireZernioKey(accountId);
    const profileId = await defaultProfileId(key);
    if (!profileId)
      throw new HttpError(412, "Crie um perfil no painel da Zernio primeiro", "no_profile");
    const r = await purchaseNumber(key, {
      profileId,
      country: "BR",
      numberType,
      ...(p.areaCode && /^\d{1,4}$/.test(p.areaCode) ? { areaCode: p.areaCode } : {}),
      purchaseIntentId: intent,
    });
    if (r.phoneNumber?.id)
      await admin()
        .from("zernio_numbers")
        .upsert(
          {
            account_id: accountId,
            zernio_number_id: r.phoneNumber.id,
            source: "purchase",
            phone_number: r.phoneNumber.phoneNumber ?? null,
            country: "BR",
            number_type: numberType,
            status: r.phoneNumber.status ?? "provisioning",
            profile_id: r.phoneNumber.profileId ?? profileId,
          } as never,
          { onConflict: "account_id,zernio_number_id" },
        );
    return {
      status: r.status ?? "provisioned",
      kycUrl: r.kycUrl ?? null,
      number: r.phoneNumber ?? null,
    };
  } catch (err) {
    asHttp(err);
  }
}

/** "Trazer meu número": confere portabilidade e lista o que a operadora exige. Não cria pedido. */
export async function portabilityCheck(accountId: string, phone: string | undefined) {
  const e164 = toE164(phone);
  if (!e164) throw new HttpError(400, "Informe o número com DDD", "bad_phone");
  try {
    const key = await requireZernioKey(accountId);
    const [result] = await portCheck(key, [e164]);
    if (!result) throw new HttpError(502, "A Zernio não respondeu sobre este número", "no_result");
    if (!result.portable)
      return {
        phone: e164,
        portable: false,
        reason: portReasonText(result.notPortableReason),
        requirements: [],
      };
    const req = await portRequirements(
      key,
      result.countryCode ?? "BR",
      result.phoneNumberType ?? "local",
    );
    return {
      phone: e164,
      portable: true,
      supported: req.supported,
      numberType: result.phoneNumberType ?? "local",
      carrier: result.carrierName ?? null,
      requirements: (req.fields ?? [])
        .filter((f) => f.kind !== "address")
        .map((f) => ({ id: f.requirementId, label: f.label, kind: f.kind })),
    };
  } catch (err) {
    asHttp(err);
  }
}

// ------------------------------------------------------------------ central da Zernio

/**
 * O que está conectado na Zernio AGORA (consulta ao vivo com a chave da conta): mensagens, redes e
 * contas de anúncio. Aproveita para trazer canais novos de mensagem para a Caixa de entrada.
 */
export async function hub(accountId: string) {
  const key = await zernioKey(accountId);
  if (!key) return { ready: false, profile: false, accounts: [] };
  try {
    const [accounts, profileId] = await Promise.all([listAccounts(key), defaultProfileId(key)]);
    await syncAccounts(accountId).catch(() => null);
    await saveStatus(accountId, "connected", null);
    return {
      ready: true,
      profile: Boolean(profileId),
      accounts: accounts.map((a) => ({
        id: a._id,
        platform: a.platform,
        name: (a.displayName ?? a.username ?? a.platform).slice(0, 80),
        active: a.isActive !== false,
      })),
    };
  } catch (err) {
    asHttp(err);
  }
}

/** Abre o cadastro da própria Zernio para a opção escolhida (rede, WhatsApp, anúncios ou agenda). */
export async function connectOption(
  req: Request,
  accountId: string,
  p: { option?: string; redirectUrl?: string; coexistence?: boolean },
) {
  const option = findOption(String(p.option ?? ""));
  if (!option) throw new HttpError(400, "Opção inválida", "bad_option");
  if (option.connect.kind === "whatsapp")
    return whatsappConnect(req, accountId, {
      coexistence: p.coexistence === true,
      ...(p.redirectUrl ? { redirectUrl: p.redirectUrl } : {}),
    });
  if (option.connect.kind === "social")
    return socialConnect(req, accountId, {
      platform: option.connect.platform,
      ...(p.redirectUrl ? { redirectUrl: p.redirectUrl } : {}),
    });
  try {
    const key = await requireZernioKey(accountId);
    const profileId = await defaultProfileId(key);
    if (!profileId)
      throw new HttpError(412, "Crie um perfil no painel da Zernio primeiro", "no_profile");
    const qs = new URLSearchParams({ profileId, redirect_url: safeRedirect(req, p.redirectUrl) });
    // agenda/e-mail: OAuth do Google ou da Microsoft feito pela Zernio, só com os escopos usados
    if (option.connect.kind === "workspace") qs.set("scopes", option.connect.scopes);
    const path =
      option.connect.kind === "workspace"
        ? `/v1/connect/${encodeURIComponent(option.connect.platform)}`
        : `/v1/connect/${encodeURIComponent(option.connect.platform)}/ads`;
    const r = await zernio<{ authUrl?: string; alreadyConnected?: boolean; displayName?: string }>(
      key,
      `${path}?${qs.toString()}`,
    );
    if (r.alreadyConnected) return { alreadyConnected: true, name: r.displayName ?? option.label };
    if (!r.authUrl) throw new HttpError(502, "A Zernio não devolveu o link de conexão", "no_url");
    return { url: r.authUrl };
  } catch (err) {
    asHttp(err);
  }
}
