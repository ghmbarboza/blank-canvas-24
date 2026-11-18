// ElevenLabs Agents (voz com IA). Sempre ler de volta depois de PATCH: a API devolve 200 e ignora chave errada.
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.elevenlabs.io";

export async function eleven<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "xi-api-key": apiKey, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${path} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function elevenTest(apiKey: string): Promise<string> {
  const u = await eleven<{
    subscription?: { tier?: string; character_count?: number; character_limit?: number };
  }>(apiKey, "/v1/user");
  const s = u.subscription;
  return `Conta válida${s?.tier ? ` (${s.tier})` : ""}${s?.character_limit ? ` · ${s.character_count}/${s.character_limit} créditos` : ""}`;
}

// Webhook pós-chamada: header ElevenLabs-Signature = "t=<ts>,v0=<hmac_sha256(ts.body)>".
export function verifyElevenWebhook(
  secret: string,
  header: string | null,
  rawBody: string,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const ts = parts["t"];
  const sig = parts["v0"];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 30 * 60) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
