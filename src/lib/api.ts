import { supabase } from "@/integrations/supabase/client";

import { FunctionError } from "./functions";

// Chama uma rota de servidor do próprio app (src/routes/api/**) com a sessão do usuário.
export async function callApi<T>(
  path: `/api/${string}`,
  body: Record<string, unknown>,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FunctionError("Sessão expirada. Entre de novo.", 401, "unauthenticated");
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new FunctionError("Sem conexão com o servidor", 0, "network");
  }
  const payload = (await res.json().catch(() => null)) as
    (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    throw new FunctionError(
      payload?.error ?? `Falha (${res.status})`,
      res.status,
      payload?.code ?? "error",
    );
  }
  return payload as T;
}
