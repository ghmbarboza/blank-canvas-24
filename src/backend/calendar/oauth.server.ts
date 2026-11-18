// Agenda pessoal do vendedor (Google Agenda e Outlook/Microsoft 365). O app OAuth é da conta
// (Ajustes › Integrações: Client ID e secret); o refresh token de cada vendedor fica no Vault.
import { HttpError, admin } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";

import { signState, tokenKey, verifyState, type CalendarProvider } from "./state";

const STATE_TTL_MS = 10 * 60_000;

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
const MS_SCOPES = ["offline_access", "openid", "email", "User.Read", "Calendars.ReadWrite"];

async function stateSecret(): Promise<string> {
  const { data, error } = await admin().rpc("email_link_secret");
  if (error || !data) throw new HttpError(503, "Segredo indisponível", "secret");
  return data as string;
}

interface App {
  clientId: string;
  clientSecret: string;
  tenant: string;
}

async function app(accountId: string, provider: CalendarProvider): Promise<App> {
  const it = await getIntegration(accountId, provider);
  const clientId = it?.config["client_id"];
  const clientSecret = it?.secrets["client_secret"];
  if (!clientId || !clientSecret)
    throw new HttpError(
      412,
      `Cadastre o Client ID e o secret do ${provider === "google" ? "Google" : "Microsoft"} em Ajustes › Integrações`,
      "not_configured",
    );
  return { clientId, clientSecret, tenant: it?.config["tenant"] || "common" };
}

export function redirectUri(base: string, provider: CalendarProvider): string {
  return `${base}/api/public/oauth/${provider}`;
}

export async function startUrl(
  accountId: string,
  userId: string,
  provider: CalendarProvider,
  base: string,
): Promise<string> {
  const a = await app(accountId, provider);
  const state = signState(
    { a: accountId, u: userId, p: provider, exp: Date.now() + STATE_TTL_MS },
    await stateSecret(),
  );
  const q = new URLSearchParams({
    client_id: a.clientId,
    redirect_uri: redirectUri(base, provider),
    response_type: "code",
    state,
  });
  if (provider === "google") {
    q.set("scope", GOOGLE_SCOPES.join(" "));
    q.set("access_type", "offline");
    q.set("prompt", "consent");
    q.set("include_granted_scopes", "true");
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  q.set("scope", MS_SCOPES.join(" "));
  q.set("response_mode", "query");
  return `https://login.microsoftonline.com/${encodeURIComponent(a.tenant)}/oauth2/v2.0/authorize?${q}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error_description?: string;
}

async function tokenCall(provider: CalendarProvider, a: App, params: Record<string, string>) {
  const url =
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : `https://login.microsoftonline.com/${encodeURIComponent(a.tenant)}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: a.clientId, client_secret: a.clientSecret, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !j.access_token)
    throw new HttpError(400, `Autorização recusada: ${j.error_description ?? res.status}`, "oauth");
  return j;
}

function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: string;
      preferred_username?: string;
    };
    return j.email ?? j.preferred_username ?? null;
  } catch {
    return null;
  }
}

async function saveRefreshToken(
  accountId: string,
  provider: CalendarProvider,
  userId: string,
  value: string,
) {
  const { error } = await admin().rpc("secret_set", {
    _account: accountId,
    _scope: "integration",
    _scope_id: accountId,
    _key: tokenKey(provider, userId),
    _value: value,
  });
  if (error) throw new HttpError(500, "Não deu para guardar a autorização", "vault");
}

/** Callback do provedor: confere o state, troca o code e grava a conexão. Devolve para onde ir. */
export async function finish(
  provider: CalendarProvider,
  code: string,
  state: string,
  base: string,
): Promise<string> {
  const st = verifyState(state, await stateSecret());
  if (!st || st.p !== provider) throw new HttpError(400, "Link de conexão expirado", "bad_state");
  const a = await app(st.a, provider);
  const t = await tokenCall(provider, a, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(base, provider),
  });
  if (!t.refresh_token)
    throw new HttpError(
      400,
      "O provedor não liberou acesso contínuo; conecte de novo",
      "no_refresh",
    );
  await saveRefreshToken(st.a, provider, st.u, t.refresh_token);
  const { error } = await admin()
    .from("calendar_connections")
    .upsert(
      {
        account_id: st.a,
        user_id: st.u,
        provider,
        email: emailFromIdToken(t.id_token),
        status: "connected",
        scopes: (t.scope ?? "").split(" ").filter(Boolean),
        last_error: null,
      },
      { onConflict: "account_id,user_id,provider" },
    );
  if (error) throw new HttpError(500, error.message, "connection");
  return `/ajustes?aba=agenda&conectado=${provider}`;
}

export interface Connection {
  id: string;
  account_id: string;
  user_id: string;
  provider: CalendarProvider;
  email: string | null;
}

export async function accessToken(c: Connection): Promise<string> {
  const a = await app(c.account_id, c.provider);
  const { data: rt } = await admin().rpc("secret_get", {
    _scope: "integration",
    _scope_id: c.account_id,
    _key: tokenKey(c.provider, c.user_id),
  });
  if (typeof rt !== "string" || !rt) throw new Error("autorização ausente");
  const t = await tokenCall(c.provider, a, { grant_type: "refresh_token", refresh_token: rt });
  if (t.refresh_token && t.refresh_token !== rt)
    await saveRefreshToken(c.account_id, c.provider, c.user_id, t.refresh_token);
  return t.access_token;
}

export async function markError(c: Connection, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  await admin()
    .from("calendar_connections")
    .update({ status: "error", last_error: msg.slice(0, 300) })
    .eq("id", c.id);
}

export async function connectionsFor(accountId: string, users: string[]): Promise<Connection[]> {
  if (!users.length) return [];
  const { data } = await admin()
    .from("calendar_connections")
    .select("id, account_id, user_id, provider, email")
    .eq("account_id", accountId)
    .in("user_id", users)
    .eq("status", "connected");
  return (data ?? []) as Connection[];
}

/** Horários ocupados na agenda externa. Falha vira [] e marca a conexão com erro (o link não cai). */
export async function externalBusy(
  c: Connection,
  from: Date,
  to: Date,
): Promise<{ start: number; end: number }[]> {
  try {
    const token = await accessToken(c);
    if (c.provider === "google") {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: "primary" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Google freeBusy ${res.status}`);
      const j = (await res.json()) as {
        calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
      };
      return (j.calendars?.["primary"]?.busy ?? []).map((b) => ({
        start: Date.parse(b.start),
        end: Date.parse(b.end),
      }));
    }
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=start,end,showAs,isCancelled&$top=500`,
      {
        headers: { authorization: `Bearer ${token}`, prefer: 'outlook.timezone="UTC"' },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Graph calendarView ${res.status}`);
    const j = (await res.json()) as {
      value?: {
        start: { dateTime: string };
        end: { dateTime: string };
        showAs?: string;
        isCancelled?: boolean;
      }[];
    };
    return (j.value ?? [])
      .filter((e) => !e.isCancelled && e.showAs !== "free")
      .map((e) => ({
        start: Date.parse(`${e.start.dateTime}Z`),
        end: Date.parse(`${e.end.dateTime}Z`),
      }));
  } catch (err) {
    await markError(c, err);
    return [];
  }
}

export interface ExternalEvent {
  title: string;
  start: string;
  end: string;
  description: string;
  joinUrl: string | null;
  attendees: string[];
}

/** Grava a reunião na agenda do vendedor. */
export async function pushEvent(c: Connection, e: ExternalEvent): Promise<string | null> {
  const token = await accessToken(c);
  if (c.provider === "google") {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          summary: e.title,
          description: e.description,
          location: e.joinUrl ?? undefined,
          start: { dateTime: e.start },
          end: { dateTime: e.end },
          attendees: e.attendees.map((email) => ({ email })),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Google events ${res.status}`);
    return ((await res.json()) as { id?: string }).id ?? null;
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      subject: e.title,
      body: { contentType: "text", content: e.description },
      start: { dateTime: e.start.replace(/Z$/, ""), timeZone: "UTC" },
      end: { dateTime: e.end.replace(/Z$/, ""), timeZone: "UTC" },
      location: e.joinUrl ? { displayName: e.joinUrl } : undefined,
      attendees: e.attendees.map((address) => ({ emailAddress: { address }, type: "required" })),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Graph events ${res.status}`);
  return ((await res.json()) as { id?: string }).id ?? null;
}

export async function disconnect(accountId: string, userId: string, provider: CalendarProvider) {
  await admin().rpc("secret_set", {
    _account: accountId,
    _scope: "integration",
    _scope_id: accountId,
    _key: tokenKey(provider, userId),
    _value: "",
  });
  await admin()
    .from("calendar_connections")
    .delete()
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .eq("provider", provider);
}
