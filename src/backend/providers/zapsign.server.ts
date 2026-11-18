// ZapSign: assinatura eletrônica com validade jurídica no Brasil. Docs: https://docs.zapsign.com.br
export function zapsignBase(env: string | undefined): string {
  return env === "production"
    ? "https://api.zapsign.com.br/api/v1"
    : "https://sandbox.api.zapsign.com.br/api/v1";
}

async function zapsign<T>(
  token: string,
  env: string | undefined,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${zapsignBase(env)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as T & { detail?: string; message?: string };
  if (!res.ok) throw new Error(`ZapSign ${path}: ${j.detail ?? j.message ?? res.status}`);
  return j;
}

export async function zapsignTest(token: string, env: string | undefined): Promise<string> {
  await zapsign<unknown>(token, env, "/docs/?page=1");
  return `Conta ZapSign ${env === "production" ? "de produção" : "sandbox"} conectada`;
}

export interface ZapsignSigner {
  name: string;
  email: string | null;
  phone: string | null; // E.164 brasileiro
}

export interface ZapsignDoc {
  token: string;
  status: string;
  signers?: { token: string; sign_url: string; status: string }[];
}

export function createDoc(
  token: string,
  env: string | undefined,
  input: { name: string; markdown: string; externalId: string; signer: ZapsignSigner },
): Promise<ZapsignDoc> {
  const digits = (input.signer.phone ?? "").replace(/\D/g, "");
  const br = digits.startsWith("55") && digits.length >= 12;
  return zapsign<ZapsignDoc>(token, env, "/docs/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 250),
      markdown_text: input.markdown,
      lang: "pt-br",
      external_id: input.externalId,
      signers: [
        {
          name: input.signer.name.slice(0, 120),
          email: input.signer.email ?? "",
          ...(br ? { phone_country: "55", phone_number: digits.slice(2) } : {}),
          auth_mode: "assinaturaTela",
          send_automatic_email: Boolean(input.signer.email),
          send_automatic_whatsapp: false,
        },
      ],
    }),
  });
}
