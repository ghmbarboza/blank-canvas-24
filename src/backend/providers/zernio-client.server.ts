// Cliente HTTP da Zernio (REST https://zernio.com/api/v1). Chave por conta, lida do cofre
// (integration:<conta>:zernio_api_key). Erro da Zernio vira ZernioError com o código dela.
import { randomUUID } from "node:crypto";

import { admin } from "@/backend/http.server";

export const ZERNIO_BASE = "https://zernio.com/api";
const TIMEOUT_MS = 20_000;

export class ZernioError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

/** Frase para o usuário leigo a partir do erro da Zernio. */
export function zernioFriendly(err: unknown): string {
  if (!(err instanceof ZernioError)) return err instanceof Error ? err.message : String(err);
  if (err.status === 401)
    return "A Zernio recusou a chave. Gere uma nova no painel da Zernio e cole aqui.";
  if (err.status === 402) return "A Zernio pede um cartão cadastrado na conta dela para isso.";
  if (err.status === 403) return "Seu plano da Zernio não libera este recurso.";
  if (err.status === 429) return "Muitas chamadas seguidas. Tente de novo em um minuto.";
  return err.message;
}

export async function zernioKey(accountId: string): Promise<string | null> {
  const { data } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: accountId,
    _key: "zernio_api_key",
  });
  return typeof data === "string" && data ? data : null;
}

export async function requireZernioKey(accountId: string): Promise<string> {
  const key = await zernioKey(accountId);
  if (!key)
    throw new ZernioError(
      412,
      "Cole a chave da Zernio em Canais › Integrações primeiro.",
      "no_key",
    );
  return key;
}

export interface ZernioRequest {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  /** Chamadas públicas (catálogo de países) vão sem chave. */
  anonymous?: boolean;
}

export async function zernio<T>(
  apiKey: string | null,
  path: string,
  req: ZernioRequest = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (!req.anonymous) {
    if (!apiKey) throw new ZernioError(412, "Chave da Zernio ausente", "no_key");
    headers["authorization"] = `Bearer ${apiKey}`;
  }
  if (req.body !== undefined) headers["content-type"] = "application/json";
  if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${ZERNIO_BASE}${path}`, {
      method: req.method ?? "GET",
      headers,
      body: req.body === undefined ? null : JSON.stringify(req.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ZernioError(503, "A Zernio não respondeu. Tente de novo.", "unreachable");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string; type?: string };
    throw new ZernioError(
      res.status,
      d.error ?? `Zernio respondeu ${res.status}`,
      d.code ?? d.type ?? "zernio_error",
    );
  }
  return data as T;
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

// ------------------------------------------------------------------ contas e perfis

export interface ZernioAccount {
  _id: string;
  platform: string;
  username?: string;
  displayName?: string;
  isActive?: boolean;
  profileId?: { _id: string } | string;
}

export async function listAccounts(apiKey: string): Promise<ZernioAccount[]> {
  const r = await zernio<{ accounts?: ZernioAccount[]; data?: ZernioAccount[] }>(
    apiKey,
    "/v1/accounts?limit=100",
  );
  return r.accounts ?? r.data ?? [];
}

export async function defaultProfileId(apiKey: string): Promise<string | null> {
  const r = await zernio<{ profiles?: { _id: string; isDefault?: boolean }[] }>(
    apiKey,
    "/v1/profiles",
  );
  const list = r.profiles ?? [];
  return (list.find((p) => p.isDefault) ?? list[0])?._id ?? null;
}

// ------------------------------------------------------------------ webhook único da conta

interface WebhookRow {
  _id: string;
  url: string;
  events?: string[];
}

/** Cria ou atualiza o webhook que aponta para esta conta (?a=<conta>), com segredo e eventos. */
export async function upsertWebhook(
  apiKey: string,
  url: string,
  secret: string,
  events: readonly string[],
) {
  const r = await zernio<{ webhooks?: WebhookRow[] }>(apiKey, "/v1/webhooks/settings");
  const account = new URL(url).searchParams.get("a");
  const mine = (r.webhooks ?? []).find((w) => {
    try {
      return new URL(w.url).searchParams.get("a") === account;
    } catch {
      return false;
    }
  });
  const body = { name: "Vínculo", url, secret, events: [...events], isActive: true };
  if (mine) {
    await zernio(apiKey, "/v1/webhooks/settings", {
      method: "PUT",
      body: { webhookId: mine._id, ...body },
    });
    return { id: mine._id, created: false };
  }
  const created = await zernio<{ webhook?: { _id: string } }>(apiKey, "/v1/webhooks/settings", {
    method: "POST",
    body,
  });
  return { id: created.webhook?._id ?? null, created: true };
}

// ------------------------------------------------------------------ cadastro do WhatsApp

export async function whatsappConnectUrl(
  apiKey: string,
  p: {
    profileId: string;
    redirectUrl: string;
    coexistence: boolean;
    brandName?: string | undefined;
  },
): Promise<string> {
  const qs = new URLSearchParams({
    profileId: p.profileId,
    redirect_url: p.redirectUrl,
    signup: "hosted",
    onboarding: p.coexistence ? "business_app" : "api",
    language: "pt-BR",
  });
  const brand = p.brandName?.trim().slice(0, 60);
  if (brand) qs.set("brandName", brand);
  const r = await zernio<{ authUrl: string }>(apiKey, `/v1/connect/whatsapp?${qs.toString()}`);
  return r.authUrl;
}

export async function socialConnectUrl(
  apiKey: string,
  platform: string,
  profileId: string,
  redirectUrl: string,
) {
  const qs = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const r = await zernio<{ authUrl: string }>(
    apiKey,
    `/v1/connect/${encodeURIComponent(platform)}?${qs.toString()}`,
  );
  return r.authUrl;
}
