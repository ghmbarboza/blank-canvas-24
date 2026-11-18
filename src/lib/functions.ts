import { supabase } from "@/integrations/supabase/client";

// Chama uma edge function e devolve a mensagem de erro real (o invoke do SDK esconde o corpo).
export class FunctionError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

const BASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const PUBLISHABLE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!BASE_URL || !PUBLISHABLE_KEY)
    throw new FunctionError("Supabase não configurado", 0, "config");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new FunctionError("Sessão expirada. Entre de novo.", 401, "unauthenticated");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
      },
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

export function errorMessage(err: unknown): string {
  if (err instanceof FunctionError) return err.message;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return "Algo deu errado";
}
