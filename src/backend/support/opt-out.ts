// Descadastro por palavra-chave (#67). Puro: decide se a mensagem do cliente é um pedido de
// descadastro. Só a mensagem inteira conta ("quero cancelar meu pedido" NÃO é descadastro).
const KEYWORDS = new Set([
  "sair",
  "parar",
  "pare",
  "stop",
  "cancelar",
  "descadastrar",
  "descadastro",
  "remover",
  "nao quero mais receber",
  "nao quero receber",
]);

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isOptOut(body: string | null | undefined): boolean {
  if (!body || body.length > 60) return false;
  return KEYWORDS.has(normalizeText(body));
}

/** Canal de consentimento de cada plataforma de mensagem (as outras não têm disparo em massa). */
export function consentChannelFor(platform: string): "whatsapp" | "sms" | null {
  if (platform === "whatsapp") return "whatsapp";
  if (platform === "sms") return "sms";
  return null;
}

export const OPT_OUT_REPLY =
  "Pronto: você não vai mais receber mensagens de divulgação por aqui. Se precisar de atendimento, é só escrever.";
