import { adminClient } from "./supabase.ts";

// Segredos ficam no Vault com nome <escopo>:<id>:<chave>. Ver public.secret_get.
export async function getSecret(scope: "integration" | "channel", scopeId: string, key: string) {
  const { data, error } = await adminClient().rpc("secret_get", {
    _scope: scope,
    _scope_id: scopeId,
    _key: key,
  });
  if (error) throw new Error(`secret_get falhou: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function setSecret(
  accountId: string,
  scope: "integration" | "channel",
  scopeId: string,
  key: string,
  value: string | null,
) {
  const { error } = await adminClient().rpc("secret_set", {
    _account: accountId,
    _scope: scope,
    _scope_id: scopeId,
    _key: key,
    _value: value ?? "",
  });
  if (error) throw new Error(`secret_set falhou: ${error.message}`);
}
