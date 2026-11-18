// Regras puras de confiança sobre contato: quem pode agir em lote, o que a página pública devolve
// e quais contatos aceitam link mágico. Sem rede; a rota aplica e o teste prova (R3, R4, R5, R7).
import { escapeHtml } from "@/features/email/render";

const MANAGER_ROLES = new Set(["owner", "admin", "manager"]);

export function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.has(role);
}

/**
 * Inscrição em automação: gestor inscreve lote e segmento; atendente e vendedor só um contato
 * por vez (e só um que eles enxergam, filtro feito na rota). Devolve a mensagem de recusa ou null.
 */
export function enrollScopeError(
  role: string,
  req: { contactIds: number; usesSegment: boolean },
): string | null {
  if (isManagerRole(role)) return null;
  if (req.usesSegment) return "Só gestores inscrevem um segmento inteiro";
  if (req.contactIds > 1) return "Só gestores inscrevem vários contatos de uma vez";
  return null;
}

/**
 * Agendamento público: quem digitou um e-mail ou celular que já estava no cadastro não provou que
 * é o dono dele. Nesse caso a resposta não leva o link da sala; o convite segue por e-mail.
 */
export function publicBookingJoinUrl(input: {
  matchedExisting: boolean;
  meetingId: string;
  guestToken: string | null;
}): string | null {
  if (input.matchedExisting || !input.guestToken) return null;
  return `/sala/${input.meetingId}?t=${input.guestToken}`;
}

/** Valor literal para ilike: % _ e \\ do texto digitado não viram curinga. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Origens em que nome e e-mail foram só digitados por um anônimo, sem prova de posse. */
export const UNVERIFIED_CONTACT_SOURCES = ["webchat"] as const;

export function portalEligible(source: string | null | undefined): boolean {
  return !(UNVERIFIED_CONTACT_SOURCES as readonly string[]).includes(source ?? "");
}

/** Corpo HTML do e-mail com o link do portal. Tudo que veio do cadastro entra escapado. */
export function portalLinkHtml(input: {
  first: string;
  accountName: string;
  link: string;
}): string {
  const first = escapeHtml(input.first);
  const company = escapeHtml(input.accountName);
  const link = escapeHtml(input.link);
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6"><p>Oi${first ? `, ${first}` : ""}.</p><p>Clique para acompanhar seus chamados na ${company}:</p><p><a href="${link}" style="display:inline-block;background:#B9915B;color:#001F35;font-weight:700;padding:10px 18px;border-radius:10px;text-decoration:none">Entrar no portal</a></p><p style="color:#667">O link vale por 20 minutos e só funciona uma vez. Se não foi você, ignore este e-mail.</p></div>`;
}
