// Lista de clientes colada na conversa ("Maria Silva, 11 98888-7777" por linha) → nome e telefone.
// Puro, testado. Telefone fica como a base guarda: só dígitos, com 55 na frente.
import { normalizePhone } from "@/features/telephony/lib";

export interface ParsedClient {
  name: string;
  phone: string;
  email: string | null;
}

const EMAIL = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/;
// sequência com cara de telefone: 10+ dígitos, com espaço, traço, ponto ou parênteses no meio
const PHONE = /\+?\(?\d[\d\s().-]{8,}\d/;

export function parseClientLine(line: string): ParsedClient | null {
  const raw = line.replace(/^[\s•\-*\d.)]{0,6}(?=\p{L})/u, "").trim();
  if (!raw) return null;
  const email = raw.match(EMAIL)?.[0] ?? null;
  const rest = email ? raw.replace(email, " ") : raw;
  const phoneRaw = rest.match(PHONE)?.[0] ?? "";
  const phone = normalizePhone(phoneRaw);
  if (!phone || phone.length < 12 || phone.length > 15) return null;
  const name = rest
    .replace(phoneRaw, " ")
    .replace(/[,;:|\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–\s]+|[-–\s]+$/g, "")
    .trim()
    .slice(0, 120);
  return { name: name || "Cliente", phone, email };
}

/** Texto colado → clientes válidos (sem repetir telefone) e as linhas que não deu para ler. */
export function parseClientList(
  text: string,
  max = 200,
): { clients: ParsedClient[]; bad: string[] } {
  const clients: ParsedClient[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n|;(?=\s*\p{L})/u)) {
    if (!line.trim()) continue;
    const c = parseClientLine(line);
    if (!c) {
      if (bad.length < 10) bad.push(line.trim().slice(0, 80));
      continue;
    }
    if (seen.has(c.phone)) continue;
    seen.add(c.phone);
    clients.push(c);
    if (clients.length >= max) break;
  }
  return { clients, bad };
}
