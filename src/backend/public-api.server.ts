// API pública (x-api-key): autenticação por hash da chave e checagem de escopo.
import { createHash } from "node:crypto";

import { HttpError, admin, rateLimit } from "@/backend/http.server";

export interface ApiCaller {
  accountId: string;
  keyId: string;
  scopes: string[];
}

export async function requireApiKey(req: Request, scope: string): Promise<ApiCaller> {
  const raw =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!raw.startsWith("nx_"))
    throw new HttpError(401, "Informe a chave no cabeçalho x-api-key", "unauthenticated");
  const hash = createHash("sha256").update(raw).digest("hex");
  const db = admin();
  const { data: key } = await db
    .from("api_keys")
    .select("id, account_id, scopes, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!key || key.revoked_at)
    throw new HttpError(401, "Chave inválida ou revogada", "unauthenticated");
  if (!key.scopes.includes(scope))
    throw new HttpError(403, `A chave não tem o escopo ${scope}`, "forbidden");
  // Teto por chave (S12): 600 pedidos por hora.
  await rateLimit(`v1:${key.id}`, 600, 3600, "Limite de 600 pedidos por hora desta chave.");
  void db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(() => undefined);
  return { accountId: key.account_id, keyId: key.id, scopes: key.scopes };
}

export function pageParams(url: URL) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  return { limit, offset };
}
