// Infra comum das rotas de servidor (src/routes/api/**): respostas, erros, autenticação e cron.
// Só servidor: importe dentro do handler com `await import("@/backend/http.server")`.
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Role = "owner" | "admin" | "manager" | "agent" | "seller";
const MANAGERS: Role[] = ["owner", "admin", "manager"];
const ADMINS: Role[] = ["owner", "admin"];

export interface Caller {
  userId: string;
  email: string | null;
  accountId: string;
  role: Role;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-api-key, x-cron-secret",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

// Envolve o handler: HttpError vira resposta com código; erro inesperado vira 500 sem vazar detalhe.
export function handle(fn: (req: Request) => Promise<Response>) {
  return async ({ request }: { request: Request }): Promise<Response> => {
    try {
      await primeAppBaseUrl();
      return await fn(request);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
      console.error("[api] erro inesperado", err);
      return json({ error: "Erro interno", code: "internal" }, 500);
    }
  };
}

/** Teto padrão do corpo JSON. Rotas públicas passam um teto menor (4–16 KB). */
export const MAX_JSON_BYTES = 256 * 1024;

export async function readJson<T>(req: Request, maxBytes: number = MAX_JSON_BYTES): Promise<T> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new HttpError(413, "Corpo grande demais", "too_large");
  const raw = await req.text();
  if (Buffer.byteLength(raw) > maxBytes)
    throw new HttpError(413, "Corpo grande demais", "too_large");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "Corpo JSON inválido", "bad_json");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function admin() {
  return supabaseAdmin;
}

// Confere o JWT do usuário e a participação ativa na conta.
export async function requireMember(
  req: Request,
  accountId: unknown,
  allowed: "member" | "manager" | "admin" = "member",
): Promise<Caller> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sessão ausente", "unauthenticated");
  if (!isUuid(accountId)) throw new HttpError(400, "Conta inválida", "bad_account");
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) throw new HttpError(401, "Sessão inválida", "unauthenticated");
  const { data: m } = await supabaseAdmin
    .from("memberships")
    .select("role, is_active")
    .eq("account_id", accountId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!m || !m.is_active) throw new HttpError(403, "Sem acesso a esta conta", "forbidden");
  const role = m.role as Role;
  if (allowed === "manager" && !MANAGERS.includes(role))
    throw new HttpError(403, "Apenas gestores", "forbidden");
  if (allowed === "admin" && !ADMINS.includes(role))
    throw new HttpError(403, "Apenas administradores", "forbidden");
  return { userId: userData.user.id, email: userData.user.email ?? null, accountId, role };
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

let cronSecret: string | null = null;
// O pg_cron manda x-cron-secret; o valor mora no Vault (public.cron_config) e é lido uma vez por instância.
export async function requireCron(req: Request): Promise<void> {
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret) {
    const { data, error } = await supabaseAdmin.rpc("cron_config");
    if (error) throw new HttpError(500, "Configuração do agendador indisponível", "cron_config");
    cronSecret = ((data as { secret?: string } | null)?.secret ?? "") || null;
  }
  if (!cronSecret || !got || !safeEqual(got, cronSecret))
    throw new HttpError(401, "Agendador não autorizado", "unauthorized");
}

// Chave de assinatura do servidor (tokens curtos, ex.: token da ligação). Separada do segredo do
// agendador desde 05/11 (R2): quem tivesse o x-cron-secret também assinava tokens. Mora no Vault
// como platform:signing_key (garantir_plataforma cria). Enquanto a migration não rodou, usa o
// segredo antigo, por no máximo 1 min por instância, para nada quebrar.
let signingKey: { value: string; fallback: boolean; at: number } | null = null;
const SIGNING_FALLBACK_TTL_MS = 60 * 1000;

export async function serverSigningKey(): Promise<string> {
  if (signingKey && (!signingKey.fallback || Date.now() - signingKey.at < SIGNING_FALLBACK_TTL_MS))
    return signingKey.value;
  const { data, error } = await supabaseAdmin.rpc("cron_config");
  if (error) throw new HttpError(503, "Tente de novo em instantes", "cron_config");
  const cfg = (data ?? {}) as { secret?: string | null; signing_key?: string | null };
  if (cfg.signing_key) signingKey = { value: cfg.signing_key, fallback: false, at: Date.now() };
  else if (cfg.secret) signingKey = { value: cfg.secret, fallback: true, at: Date.now() };
  else throw new HttpError(503, "Plataforma ainda não preparada", "no_secret");
  return signingKey.value;
}

// Endereço público do app. Cada remix tem o seu, gravado no Vault por garantir_plataforma no
// primeiro acesso do dono; nunca cai no endereço do app original.
let platformBase: { url: string | null; at: number } | null = null;
const BASE_TTL_MS = 10 * 60 * 1000;

export async function primeAppBaseUrl(force = false): Promise<string | null> {
  if (!force && platformBase && Date.now() - platformBase.at < BASE_TTL_MS) return platformBase.url;
  try {
    const { data } = await supabaseAdmin.rpc("cron_config");
    const url = ((data as { base_url?: string | null } | null)?.base_url ?? "") || null;
    platformBase = { url: url ? url.replace(/\/$/, "") : null, at: Date.now() };
  } catch {
    platformBase = { url: platformBase?.url ?? null, at: Date.now() };
  }
  return platformBase.url;
}

export function appBaseUrl(req?: Request): string {
  const env = process.env["APP_BASE_URL"];
  if (env) return env.replace(/\/$/, "");
  if (platformBase?.url) return platformBase.url;
  if (req) return new URL(req.url).origin;
  throw new HttpError(
    503,
    "O endereço do app ainda não foi configurado. Abra o app publicado como dono para concluir.",
    "no_base_url",
  );
}

// Limite de taxa compartilhado (tabela rate_limits via hit_rate_limit). IP só do Cloudflare:
// x-forwarded-for é forjável. Sem IP, a chave cai num balde comum (nunca pula o limite).
export function trustedIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? "sem-ip";
}

/** Como rateLimit, mas devolve se pode contar em vez de recusar (contadores públicos). */
export async function allowOnce(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("hit_rate_limit", {
    _key: key.slice(0, 200),
    _max: max,
    _window_seconds: windowSeconds,
  });
  return !error && data !== false;
}

export async function rateLimit(key: string, max: number, windowSeconds: number, message?: string) {
  const { data: allowed, error } = await supabaseAdmin.rpc("hit_rate_limit", {
    _key: key.slice(0, 200),
    _max: max,
    _window_seconds: windowSeconds,
  });
  if (error) throw new HttpError(503, "Tente de novo em instantes", "rate_limit_unavailable");
  if (allowed === false)
    throw new HttpError(
      429,
      message ?? "Muitas tentativas. Tente de novo em alguns minutos.",
      "rate_limited",
    );
}
