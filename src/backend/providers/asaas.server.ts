// Asaas: cobrança por Pix, boleto e cartão. Docs: https://docs.asaas.com
export function asaasBase(env: string | undefined): string {
  return env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export async function asaas<T>(
  apiKey: string,
  env: string | undefined,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${asaasBase(env)}${path}`, {
    ...init,
    headers: {
      access_token: apiKey,
      "content-type": "application/json",
      "user-agent": "NexusOne",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as T & { errors?: { description: string }[] };
  if (!res.ok) throw new Error(`Asaas ${path}: ${j.errors?.[0]?.description ?? res.status}`);
  return j;
}

export async function asaasTest(apiKey: string, env: string | undefined): Promise<string> {
  const a = await asaas<{ name?: string; email?: string }>(apiKey, env, "/myAccount");
  return `Conta ${env === "production" ? "de produção" : "sandbox"}: ${a.name ?? a.email ?? "ok"}`;
}
