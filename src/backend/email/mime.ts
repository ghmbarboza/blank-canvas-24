// Mensagem MIME crua (RFC 5322/2045) para provedores que pedem o e-mail inteiro, como o
// Amazon SES quando há anexo. Texto e HTML vão em base64 (UTF-8 sem surpresa de quebra de linha).
import { randomBytes } from "node:crypto";

export interface MimeInput {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string; content_type?: string }[];
  /** Fixo nos testes. */
  boundary?: string;
}

const CRLF = "\r\n";

/** Cabeçalho com acento vira encoded-word (RFC 2047); ASCII passa como está. */
export function encodeHeader(v: string): string {
  const clean = v.replace(/[\r\n]+/g, " ");

  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** "Nome <email>" com o nome codificado quando tem acento. */
export function encodeAddress(v: string): string {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!m) return v.trim();
  const name = m[1]!.trim();
  return name ? `${encodeHeader(name)} <${m[2]!.trim()}>` : `<${m[2]!.trim()}>`;
}

function b64Lines(s: string, isBase64 = false): string {
  const b = isBase64 ? s.replace(/\s+/g, "") : Buffer.from(s, "utf8").toString("base64");
  return b.match(/.{1,76}/g)?.join(CRLF) ?? "";
}

function safeName(v: string): string {
  return v.replace(/[\r\n"\\]/g, "_").slice(0, 120) || "anexo";
}

export function buildMime(m: MimeInput): string {
  const tag = m.boundary ?? randomBytes(12).toString("hex");
  const mixed = `mixed_${tag}`;
  const alt = `alt_${tag}`;
  const head: string[] = [
    `From: ${encodeAddress(m.from)}`,
    `To: ${m.to.map(encodeAddress).join(", ")}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (m.replyTo) head.push(`Reply-To: ${encodeAddress(m.replyTo)}`);
  for (const [k, v] of Object.entries(m.headers ?? {})) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(k)) continue;
    head.push(`${k}: ${encodeHeader(v)}`);
  }
  const alternative = [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(m.text ?? ""),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(m.html),
    `--${alt}--`,
  ];
  const atts = m.attachments ?? [];
  if (!atts.length) return [...head, ...alternative, ""].join(CRLF);
  const parts: string[] = [
    ...head,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    ...alternative,
  ];
  for (const a of atts) {
    const name = safeName(a.filename);
    parts.push(
      `--${mixed}`,
      `Content-Type: ${a.content_type && /^[\w.+-]+\/[\w.+-]+(;.*)?$/.test(a.content_type) ? a.content_type.replace(/[\r\n]/g, "") : "application/octet-stream"}; name="${name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${name}"`,
      "",
      b64Lines(a.content, true),
    );
  }
  parts.push(`--${mixed}--`, "");
  return parts.join(CRLF);
}
