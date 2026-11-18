// Sessão do portal do cliente: token assinado (HMAC-SHA256) que diz qual contato de qual conta
// está logado e até quando. Link mágico: valor aleatório de uso único, só o hash vai ao banco.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MAGIC_LINK_TTL_MS = 20 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface PortalSession {
  a: string; // conta
  c: string; // contato
  exp: number; // epoch ms
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signSession(s: PortalSession, secret: string): string {
  const body = b64url(JSON.stringify(s));
  const sig = b64url(createHmac("sha256", secret).update(`portal.${body}`).digest());
  return `${body}.${sig}`;
}

/** Devolve a sessão se a assinatura confere e não expirou; senão null. */
export function verifySession(
  token: string,
  secret: string,
  now = Date.now(),
): PortalSession | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret).update(`portal.${body}`).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PortalSession;
    if (typeof s.a !== "string" || typeof s.c !== "string" || typeof s.exp !== "number")
      return null;
    return s.exp > now ? s : null;
  } catch {
    return null;
  }
}

export function newMagicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** E-mail ou celular brasileiro, normalizado para casar com o cadastro. */
export function parseIdentity(raw: string): { kind: "email" | "phone"; value: string } | null {
  const v = raw.trim().toLowerCase();
  if (/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(v)) return { kind: "email", value: v };
  const d = v.replace(/\D/g, "");
  if (d.length >= 10 && d.length <= 13)
    return { kind: "phone", value: d.startsWith("55") ? d : `55${d}` };
  return null;
}
