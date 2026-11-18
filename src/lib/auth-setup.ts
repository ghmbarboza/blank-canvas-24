// O remix do Lovable NÃO copia a configuração de login: a cópia nasce com e-mail e Google
// DESLIGADOS (visto em 18/11 numa cópia real: /auth/v1/settings com external.email=false e
// external.google=false). Sem isso ninguém cria a primeira conta. A tela de entrada lê o estado
// e, quando falta, mostra o que ligar em vez de falhar calada.

export type AuthProviders = { email: boolean; google: boolean };

/** Lê o retorno de /auth/v1/settings. Devolve null quando o formato não é o esperado. */
export function parseAuthProviders(payload: unknown): AuthProviders | null {
  if (!payload || typeof payload !== "object") return null;
  const external = (payload as { external?: unknown }).external;
  if (!external || typeof external !== "object") return null;
  const flags = external as Record<string, unknown>;
  return { email: flags["email"] === true, google: flags["google"] === true };
}

/** null = não deu para saber (rede, formato): a tela segue como se estivesse tudo ligado. */
export async function fetchAuthProviders(
  url: string | undefined,
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<AuthProviders | null> {
  if (!url || !key) return null;
  try {
    const response = await fetcher(`${url.replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    if (!response.ok) return null;
    return parseAuthProviders(await response.json());
  } catch {
    return null;
  }
}

/** O Google devolve o erro no fragmento do endereço (#error=...&error_description=...). */
export function oauthErrorFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.get("error")) return null;
  const description = params.get("error_description") ?? "";
  if (/not supported|not enabled|disabled/i.test(decodeURIComponent(description)))
    return "O login com Google ainda não está ligado nesta cópia. Ligue em Users › Auth settings › Google, no editor do Lovable, ou entre com e-mail e senha.";
  return "Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.";
}
