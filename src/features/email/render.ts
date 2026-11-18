// Montagem do e-mail que sai: blocos → HTML, variáveis, rastreio de abertura/clique e descadastro.
// Puro (sem rede): roda no editor (pré-visualização) e no servidor (envio). Lições da EasyCover:
// todo e-mail leva pixel e descadastro; variável sem valor bloqueia o envio; o rastreio não
// embrulha o próprio link de rastreio nem o de descadastro.

export type BlockType = "heading" | "text" | "image" | "button" | "divider" | "spacer";

export interface EmailBlock {
  id: string;
  type: BlockType;
  text?: string;
  url?: string;
  src?: string;
  alt?: string;
  align?: "left" | "center";
}

export interface Brand {
  name: string;
  address?: string | null;
  color?: string;
}

export const UNSUB_TOKEN = "{{unsubscribe_url}}";

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(u: string | undefined): string | null {
  const s = String(u ?? "").trim();
  if (/^\{\{[a-z_.]+\}\}$/i.test(s)) return s;
  return /^(https?:\/\/[^\s"]+|mailto:[^\s"]+)$/i.test(s) && s !== "https://" ? s : null;
}

// Texto simples com quebras de linha e **negrito**; variáveis {{...}} passam intactas.
function richText(t: string): string {
  return escapeHtml(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

export function blocksToHtml(
  blocks: EmailBlock[],
  opts: { preheader?: string | null; brand: Brand; marketing: boolean; signature?: string | null },
): string {
  const color = opts.brand.color ?? "#0A1F3B";
  const rows = blocks
    .map((b) => {
      const align = b.align ?? "left";
      switch (b.type) {
        case "heading":
          return `<tr><td style="padding:8px 32px 4px;text-align:${align}"><h1 style="margin:0;font-size:24px;line-height:1.25;color:#0A1F3B;font-weight:600">${richText(b.text ?? "")}</h1></td></tr>`;
        case "text":
          return `<tr><td style="padding:8px 32px;text-align:${align};font-size:15px;line-height:1.6;color:#334155">${richText(b.text ?? "")}</td></tr>`;
        case "image": {
          const src = safeUrl(b.src);
          if (!src) return "";
          const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt ?? "")}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:12px">`;
          const href = safeUrl(b.url);
          return `<tr><td style="padding:8px 32px">${href ? `<a href="${escapeHtml(href)}">${img}</a>` : img}</td></tr>`;
        }
        case "button": {
          const href = safeUrl(b.url);
          if (!href) return "";
          return `<tr><td style="padding:16px 32px;text-align:${align}"><a href="${escapeHtml(href)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">${escapeHtml(b.text || "Saiba mais")}</a></td></tr>`;
        }
        case "divider":
          return `<tr><td style="padding:16px 32px"><hr style="border:0;border-top:1px solid #e2e8f0;margin:0"></td></tr>`;
        case "spacer":
          return `<tr><td style="height:24px;line-height:24px">&nbsp;</td></tr>`;
        default:
          return "";
      }
    })
    .join("");
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>`
    : "";
  const sig = opts.signature
    ? `<tr><td style="padding:16px 32px 0;font-size:14px;line-height:1.6;color:#334155">${richText(opts.signature)}</td></tr>`
    : "";
  const footer = opts.marketing
    ? `<tr><td style="padding:24px 32px 32px;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center">Você recebe este e-mail de ${escapeHtml(opts.brand.name)}.${opts.brand.address ? `<br>${escapeHtml(opts.brand.address)}` : ""}<br><a href="${UNSUB_TOKEN}" style="color:#64748b">Não quero mais receber estes e-mails</a></td></tr>`
    : `<tr><td style="padding:16px 32px 28px;font-size:12px;color:#94a3b8;text-align:center">${escapeHtml(opts.brand.name)}</td></tr>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title></head><body style="margin:0;padding:0;background:#f4f6fa;font-family:Geist,-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 12px"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden"><tr><td style="height:24px"></td></tr>${rows}${sig}${footer}</table></td></tr></table></body></html>`;
}

/** Corpo de e-mail 1:1 (texto do vendedor) em HTML simples, sem cara de campanha. */
export function plainToHtml(text: string, signature?: string | null): string {
  const body = richText(text);
  const sig = signature ? `<br><br>${richText(signature)}` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${body}${sig}</body></html>`;
}

/** Variáveis aceitas: nome, primeiro_nome, email, telefone, empresa, cargo, cidade, vendedor, campo.<chave>. */
export type EmailVars = Record<string, string | number | null | undefined>;

export const VARIABLES: { key: string; label: string }[] = [
  { key: "primeiro_nome", label: "Primeiro nome" },
  { key: "nome", label: "Nome completo" },
  { key: "email", label: "E-mail" },
  { key: "empresa", label: "Empresa" },
  { key: "cargo", label: "Cargo" },
  { key: "cidade", label: "Cidade" },
  { key: "vendedor", label: "Nome do vendedor" },
];

const VAR_RE = /\{\{\s*([a-z_][a-z0-9_.]*)\s*(?:\|\s*([^}]*?))?\s*\}\}/gi;

/**
 * Troca {{variável}} (com fallback opcional: {{primeiro_nome | cliente}}). O que ficar sem valor
 * volta em `missing` e o envio é barrado: melhor não mandar que mandar "Olá {{nome}}".
 * {{unsubscribe_url}} fica para a etapa de rastreio, que é quem tem o link assinado.
 */
export function renderVariables(
  text: string,
  vars: EmailVars,
  html = true,
): { out: string; missing: string[] } {
  const missing = new Set<string>();
  const out = String(text ?? "").replace(VAR_RE, (whole, key: string, fallback?: string) => {
    const k = key.toLowerCase();
    if (k === "unsubscribe_url") return whole;
    const v = vars[k];
    const value =
      v === null || v === undefined || String(v).trim() === ""
        ? (fallback?.trim() ?? "")
        : String(v);
    if (!value) {
      missing.add(k);
      return whole;
    }
    return html ? escapeHtml(value) : value;
  });
  return { out, missing: [...missing] };
}

export function contactVars(
  c: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    job_title?: string | null;
    city?: string | null;
    custom?: unknown;
  },
  seller?: string | null,
): EmailVars {
  const name = (c.name ?? "").trim();
  const vars: EmailVars = {
    nome: name,
    primeiro_nome: name.split(/\s+/)[0] ?? "",
    email: c.email ?? "",
    telefone: c.phone ?? "",
    empresa: c.company ?? "",
    cargo: c.job_title ?? "",
    cidade: c.city ?? "",
    vendedor: seller ?? "",
  };
  if (c.custom && typeof c.custom === "object") {
    for (const [k, v] of Object.entries(c.custom as Record<string, unknown>)) {
      if (v === null || v === undefined || typeof v === "object") continue;
      vars[`campo.${k}`] = String(v);
    }
  }
  return vars;
}

function ctaOf(tag: string): string {
  return tag
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Prepara o HTML para envio: troca o descadastro pelo link assinado, reescreve links http(s) para a
 * rota de clique (guardando os destinos originais) e põe o pixel de abertura. Marketing sem
 * descadastro no modelo ganha o rodapé (Gmail/Yahoo exigem desde 2024).
 */
export function withTracking(
  html: string,
  t: { base: string; messageId: string; unsubscribeUrl: string | null },
): { html: string; links: string[] } {
  const links: string[] = [];
  let out = String(html ?? "");
  if (t.unsubscribeUrl && !out.includes(UNSUB_TOKEN)) {
    const foot = `<p style="font-size:12px;color:#94a3b8;text-align:center;margin:24px 0"><a href="${UNSUB_TOKEN}" style="color:#64748b">Não quero mais receber estes e-mails</a></p>`;
    out = out.includes("</body>") ? out.replace("</body>", `${foot}</body>`) : out + foot;
  }
  const clickBase = `${t.base}/api/public/email/c/${t.messageId}`;
  out = out.replace(
    /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<\/a>/gi,
    (tag: string, rawUrl: string) => {
      const url = rawUrl.replace(/&amp;/g, "&");
      if (url.startsWith(t.base)) return tag;
      links.push(url);
      const cta = ctaOf(tag);
      const href = `${clickBase}?u=${encodeURIComponent(url)}${cta ? `&amp;c=${encodeURIComponent(cta)}` : ""}`;
      return tag.replace(`href="${rawUrl}"`, `href="${href}"`);
    },
  );
  if (t.unsubscribeUrl) out = out.split(UNSUB_TOKEN).join(escapeHtml(t.unsubscribeUrl));
  const pixel = `<img src="${t.base}/api/public/email/o/${t.messageId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  out = out.includes("</body>") ? out.replace("</body>", `${pixel}</body>`) : out + pixel;
  return { html: out, links: [...new Set(links)] };
}

export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|tr|h1|h2|div)>/gi, "\n")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** O destino do clique só vale se estava no próprio e-mail (impede redirecionamento aberto). */
export function isAllowedRedirect(url: string, links: string[]): boolean {
  return /^https?:\/\//i.test(url) && links.includes(url);
}

export function newBlock(type: BlockType): EmailBlock {
  const id = Math.random().toString(36).slice(2, 10);
  switch (type) {
    case "heading":
      return { id, type, text: "Título do e-mail" };
    case "text":
      return { id, type, text: "Olá {{primeiro_nome | tudo bem}}, escreva aqui a mensagem." };
    case "button":
      return { id, type, text: "Saiba mais", url: "https://", align: "left" };
    case "image":
      return { id, type, src: "https://", alt: "" };
    default:
      return { id, type };
  }
}

export function isEmailBlocks(v: unknown): v is EmailBlock[] {
  return Array.isArray(v) && v.every((b) => b && typeof b === "object" && "type" in (b as object));
}
