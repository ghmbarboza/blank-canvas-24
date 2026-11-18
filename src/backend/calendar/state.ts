// "state" do OAuth assinado (HMAC-SHA256): quem iniciou a conexão e até quando vale. Sem ele, o
// callback não sabe de qual conta/usuário é o code e fica aberto a CSRF.
import { createHmac, timingSafeEqual } from "node:crypto";

export type CalendarProvider = "google" | "microsoft";

export interface OAuthState {
  a: string; // conta
  u: string; // usuário
  p: CalendarProvider;
  exp: number; // epoch ms
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function signState(st: OAuthState, secret: string): string {
  const body = b64(JSON.stringify(st));
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(token: string, secret: string, now = Date.now()): OAuthState | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
    return null;
  try {
    const st = JSON.parse(Buffer.from(body, "base64url").toString()) as OAuthState;
    if (typeof st.exp !== "number" || st.exp < now) return null;
    if (st.p !== "google" && st.p !== "microsoft") return null;
    return st;
  } catch {
    return null;
  }
}

/** Chave do refresh token no Vault (escopo integração da conta; regex ^[a-z0-9_]{2,40}$). */
export function tokenKey(provider: CalendarProvider, userId: string): string {
  return `${provider === "google" ? "g" : "m"}cal_${userId.replace(/-/g, "").toLowerCase()}`;
}
