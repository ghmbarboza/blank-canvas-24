// Cloudflare Turnstile: conferência do token do widget no servidor (siteverify).
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
import { admin } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileOutcome {
  ok: boolean;
  codes: string[];
}

export interface TurnstileKeys {
  siteKey: string;
  secret: string;
}

/** Chaves da conta, só quando as duas estão salvas. Sem elas o formulário segue sem Turnstile. */
export async function turnstileKeys(accountId: string): Promise<TurnstileKeys | null> {
  const it = await getIntegration(accountId, "turnstile");
  const siteKey = it?.config["site_key"];
  const secret = it?.secrets["secret"];
  return siteKey && secret ? { siteKey, secret } : null;
}

/** Só a site key (pública) para desenhar o widget. */
export async function turnstileSiteKey(accountId: string): Promise<string | null> {
  const { data } = await admin()
    .from("account_integrations")
    .select("config")
    .eq("account_id", accountId)
    .eq("provider", "turnstile")
    .maybeSingle();
  const siteKey = (data?.config as Record<string, string> | null)?.["site_key"];
  if (!siteKey) return null;
  // sem a secret salva o servidor não confere: não adianta pedir o widget
  return (await turnstileKeys(accountId)) ? siteKey : null;
}

/** Interpreta a resposta do siteverify. Sem token nem chega a chamar a Cloudflare. */
export function readOutcome(body: unknown): TurnstileOutcome {
  const j = (body ?? {}) as { success?: unknown; "error-codes"?: unknown };
  const codes = Array.isArray(j["error-codes"]) ? j["error-codes"].map(String) : [];
  return { ok: j.success === true, codes };
}

export async function verifyTurnstile(
  secret: string,
  token: string | null | undefined,
  ip: string | null,
): Promise<TurnstileOutcome> {
  if (!token || typeof token !== "string" || token.length > 2048)
    return { ok: false, codes: ["missing-input-response"] };
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8_000),
    });
    return readOutcome(await res.json().catch(() => ({})));
  } catch {
    return { ok: false, codes: ["internal-error"] };
  }
}

/** Teste da integração: um token inválido de propósito mostra se a secret foi aceita. */
export async function turnstileTest(secret: string): Promise<string> {
  const out = await verifyTurnstile(secret, "teste-do-nexus", null);
  if (out.codes.includes("invalid-input-secret")) throw new Error("Secret key recusada");
  if (out.codes.includes("internal-error")) throw new Error("Cloudflare não respondeu");
  return "Secret key aceita pela Cloudflare";
}
