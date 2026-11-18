// Leitura das integrações da conta no servidor: config (coluna) + segredos (Vault).
import { admin } from "@/backend/http.server";
import { providerDef, secretKeyName, type ProviderId } from "@/features/integrations/providers";

export interface Integration {
  provider: ProviderId;
  status: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}

export class NotConfigured extends Error {
  constructor(public provider: string) {
    super(`Integração ${provider} não configurada`);
  }
}

export async function getIntegration(
  accountId: string,
  provider: ProviderId,
): Promise<Integration | null> {
  const def = providerDef(provider);
  if (!def) return null;
  const db = admin();
  const { data: row } = await db
    .from("account_integrations")
    .select("status, config")
    .eq("account_id", accountId)
    .eq("provider", provider)
    .maybeSingle();
  if (!row) return null;
  const secrets: Record<string, string> = {};
  await Promise.all(
    def.fields
      .filter((f) => f.secret)
      .map(async (f) => {
        const { data } = await db.rpc("secret_get", {
          _scope: "integration",
          _scope_id: accountId,
          _key: secretKeyName(provider, f.key),
        });
        if (typeof data === "string" && data) secrets[f.key] = data;
      }),
  );
  return {
    provider,
    status: row.status,
    config: (row.config ?? {}) as Record<string, string>,
    secrets,
  };
}

export async function requireIntegration(
  accountId: string,
  provider: ProviderId,
): Promise<Integration> {
  const it = await getIntegration(accountId, provider);
  const def = providerDef(provider)!;
  const missing = def.fields.filter(
    (f) => !f.optional && !(f.secret ? it?.secrets[f.key] : it?.config[f.key]),
  );
  if (!it || missing.length > 0) throw new NotConfigured(def.name);
  return it;
}
