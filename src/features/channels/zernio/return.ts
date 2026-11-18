// Volta do cadastro hospedado da Zernio: a Zernio acrescenta connected, accountId, username ou
// error ao endereço que mandamos (/canais?zernio=whatsapp&coex=1). KYC volta com kyc=submitted.
export type ZernioReturn =
  | { kind: "whatsapp"; zernioAccountId: string | null; coexistence: boolean; error: string | null }
  | { kind: "kyc"; submitted: boolean };

const ERRORS: Record<string, string> = {
  connection_cancelled: "O cadastro foi fechado antes do fim. Tente de novo quando quiser.",
  session_expired: "A página de cadastro expirou (60 min). Comece de novo.",
  whatsapp_number_already_connected: "Este número já está conectado em outra conta da Zernio.",
  one_whatsapp_per_profile: "Este perfil da Zernio já tem um número. Use outro perfil.",
  whatsapp_number_pinned_to_profile: "O número comprado está preso a outro perfil da Zernio.",
  payment_required: "A Meta pediu uma forma de pagamento na sua conta comercial.",
  whatsapp_error: "A Meta recusou o cadastro.",
};

export const ZERNIO_RETURN_KEYS = [
  "zernio",
  "coex",
  "accountId",
  "error",
  "error_message",
  "kyc",
] as const;

export function zernioErrorText(code: string | null, detail?: string | null): string | null {
  if (!code) return null;
  const base = ERRORS[code] ?? "O cadastro não terminou.";
  return detail ? `${base} (${detail})` : base;
}

export function parseZernioReturn(search: Record<string, unknown>): ZernioReturn | null {
  const str = (k: string) => {
    const v = search[k];
    return typeof v === "string" && v ? v.slice(0, 200) : typeof v === "number" ? String(v) : null;
  };
  const kind = str("zernio");
  if (kind === "whatsapp") {
    const acc = str("accountId");
    return {
      kind: "whatsapp",
      zernioAccountId: acc && /^[A-Za-z0-9]{6,40}$/.test(acc) ? acc : null,
      coexistence: str("coex") === "1",
      error: zernioErrorText(str("error"), str("error_message")),
    };
  }
  if (kind === "kyc") return { kind: "kyc", submitted: str("kyc") === "submitted" };
  return null;
}
