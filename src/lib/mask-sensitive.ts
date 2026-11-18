// Mascara dado sensível (CPF, cartão e senha) antes de o texto ir para a IA ou para o log.
// Função pura: roda no servidor (entrada da camada de LLM e do avaliador) e no navegador.

export interface MaskResult {
  text: string;
  counts: { cpf: number; card: number; secret: number };
}

export const MASK = {
  cpf: "[CPF oculto]",
  card: "[cartão oculto]",
  secret: "[senha oculta]",
} as const;

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/** CPF válido pelos dígitos verificadores (descarta 000.000.000-00 e repetições). */
export function isValidCpf(raw: string): boolean {
  const d = digits(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Número de cartão: 13 a 19 dígitos e Luhn válido. */
export function isLuhn(raw: string): boolean {
  const d = digits(raw);
  if (d.length < 13 || d.length > 19 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

// "senha: abc123", "minha senha é xyz", "a senha do app é xyz", "password=...", "PIN 1234", "cvv 123".
const LABEL = String.raw`\b(senha|password|passwd|pin|cvv|cvc|c[oó]digo de (?:acesso|seguran[cç]a)|token de acesso)`;
const VALUE = String.raw`("[^"]{1,80}"|'[^']{1,80}'|[^\s,;]{2,80})`;
// Com separador explícito (":", "=", "é"), até 3 palavras entre o rótulo e o valor.
const SECRET_EXPLICIT_RE = new RegExp(
  `${LABEL}((?:\\s+[\\p{L}]{2,15}){0,3}?(?:\\s*[:=]\\s*|\\s+(?:é|eh|is)\\s+))${VALUE}`,
  "giu",
);
// Sem separador ("pin 1234"): o valor precisa ter dígito ou símbolo, para não pegar "pin de localização".
const SECRET_IMPLICIT_RE = new RegExp(`${LABEL}(\\s+)${VALUE}`, "giu");

// Sequências de 13 a 19 dígitos com espaço ou hífen entre grupos.
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
// CPF formatado (000.000.000-00) ou 11 dígitos colados.
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

export function maskSensitive(input: string | null | undefined): MaskResult {
  const counts = { cpf: 0, card: 0, secret: 0 };
  if (!input) return { text: input ?? "", counts };
  let text = input.replace(SECRET_EXPLICIT_RE, (_m, label: string, sep: string) => {
    counts.secret++;
    return `${label}${sep}${MASK.secret}`;
  });
  text = text.replace(
    SECRET_IMPLICIT_RE,
    (m: string, label: string, sep: string, value: string, at: number, all: string) => {
      // Já mascarado ("[senha oculta]") ou palavra comum: fica como está.
      if (all[at - 1] === "[" || value.startsWith("[") || /^[\p{L}]+$/u.test(value)) return m;
      counts.secret++;
      return `${label}${sep}${MASK.secret}`;
    },
  );
  text = text.replace(CARD_RE, (m) => {
    if (!isLuhn(m)) return m;
    counts.card++;
    return MASK.card;
  });
  text = text.replace(CPF_RE, (m) => {
    if (!isValidCpf(m)) return m;
    counts.cpf++;
    return MASK.cpf;
  });
  return { text, counts };
}

/** Atalho: só o texto mascarado. */
export function maskText(input: string | null | undefined): string {
  return maskSensitive(input).text;
}
