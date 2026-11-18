// Chamada da função de canais (Supabase) em nome da pessoa logada: é o mesmo caminho da tela de
// Canais, com as mesmas permissões e o mesmo cofre de chaves. O servidor não chama o próprio
// domínio: fala direto com o endereço do banco. Toda chamada tem prazo.
import { HttpError } from "@/backend/http.server";

const DEFAULT_TIMEOUT_MS = 30_000;

function baseUrl(): string {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  if (!url) throw new HttpError(503, "Endereço do banco não configurado", "no_supabase_url");
  return url.replace(/\/+$/, "");
}

function publishableKey(): string {
  return (
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"] ??
    ""
  );
}

export async function callChannels<T>(
  req: Request,
  accountId: string,
  action: string,
  params: Record<string, unknown> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const auth = req.headers.get("authorization");
  if (!auth) throw new HttpError(401, "Sessão ausente", "unauthenticated");
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/functions/v1/channels`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: auth,
        ...(publishableKey() ? { apikey: publishableKey() } : {}),
      },
      body: JSON.stringify({ accountId, action, ...params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const slow = (err as Error)?.name === "TimeoutError";
    throw new Error(
      slow
        ? "o servidor demorou demais para responder (tempo esgotado)"
        : "sem conexão com o serviço de canais (network)",
    );
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `o serviço de canais respondeu ${res.status}`);
  return body as T;
}
