// Segredo colado no chat nunca vai para o histórico: a IA recebe o valor só naquela rodada (para
// guardar no cofre) e o que fica gravado é a frase com •••• no lugar. Puro, testado.

// Formatos conhecidos dos provedores que o Nexus usa, e um genérico para tokens longos.
const PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, // OpenAI
  /\bsk_[A-Za-z0-9]{16,}/g, // Zernio, ElevenLabs
  /\bre_[A-Za-z0-9_]{16,}/g, // Resend
  /\bak_[A-Za-z0-9_-]{16,}/g, // Composio
  /\$aact_[A-Za-z0-9_:$=-]{20,}/g, // Asaas
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAPI[A-Za-z0-9]{10,}\b/g, // LiveKit API key
  /\bEAA[A-Za-z0-9]{40,}/g, // Meta
  /\bwhsec_[A-Za-z0-9+/=]{16,}/g, // webhooks (Resend/Svix)
  /\b0x4[A-Za-z0-9_-]{18,}/g, // Cloudflare Turnstile
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
];
// Token longo sem formato conhecido (letras e números misturados, 32+): também é tratado como segredo.
const GENERIC = /\b(?=[A-Za-z0-9_+/=-]*\d)(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{32,}\b/g;

// Resposta de formulário de chave ("Key da Zadarma: abc…", "Segredo da API: …"): o valor depois do
// rótulo é segredo mesmo sem formato conhecido (a chave da Zadarma tem ~20 letras e números).
const LABELED =
  /^[^\S\n]*[^\n:]*\b(?:chave|key|secret|segredo|token|senha|password)\b[^\n:]*:[^\S\n]*(\S{8,})[^\S\n]*$/gim;

export const MASK = "•••• (guardado no cofre)";

export function findSecrets(text: string): string[] {
  const found = new Set<string>();
  for (const re of [...PATTERNS, GENERIC]) for (const m of text.matchAll(re)) found.add(m[0]);
  for (const m of text.matchAll(LABELED)) if (m[1] && !m[1].includes("•")) found.add(m[1]);
  return [...found];
}

export function redact(text: string): { text: string; secrets: string[] } {
  const secrets = findSecrets(text);
  let out = text;
  // os mais longos primeiro: um segredo que contém outro não fica pela metade
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) out = out.split(s).join(MASK);
  return { text: out, secrets };
}
