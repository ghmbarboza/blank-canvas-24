// Formulários e landing pages: tipos compartilhados entre o construtor (tela), a página pública e o servidor.
import { normalizePhone } from "@/features/telephony/lib";

export type FormFieldType =
  "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "number" | "date" | "hidden";
export type FieldMap =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "job_title"
  | "city"
  | "notes"
  | `custom.${string}`
  | null;

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  map: FieldMap;
  default?: string;
}

export interface FormConsent {
  enabled: boolean;
  text: string;
  channels: ("email" | "whatsapp" | "sms")[];
  required: boolean;
}

export interface FormDestination {
  owner_mode: "none" | "user" | "round_robin";
  users: string[];
  create_deal: boolean;
  pipeline_id?: string | null;
  stage_id?: string | null;
  tags: string[];
  /** Envio que qualifica recebe o link de agendamento (ver schedule.ts). */
  schedule?: unknown;
}

export interface FormTheme {
  accent?: string;
  dark?: boolean;
  rounded?: boolean;
}

export interface PublicForm {
  id: string;
  title: string;
  description: string | null;
  fields: FormField[];
  consent: FormConsent;
  submit_label: string;
  theme: FormTheme;
  /** Cloudflare Turnstile da conta (só a chave pública); ausente = sem verificação. */
  turnstile_site_key?: string | null;
}

export const FIELD_TYPE_LABEL: Record<FormFieldType, string> = {
  text: "Texto",
  email: "E-mail",
  phone: "Telefone",
  textarea: "Texto longo",
  select: "Lista de opções",
  checkbox: "Caixa de seleção",
  number: "Número",
  date: "Data",
  hidden: "Oculto (UTM, origem)",
};

export const MAP_LABEL: Record<string, string> = {
  name: "Nome do contato",
  email: "E-mail do contato",
  phone: "Telefone do contato",
  company: "Empresa",
  job_title: "Cargo",
  city: "Cidade",
  notes: "Observações",
};

export const DEFAULT_FIELDS: FormField[] = [
  {
    key: "nome",
    label: "Nome",
    type: "text",
    required: true,
    map: "name",
    placeholder: "Seu nome",
  },
  {
    key: "email",
    label: "E-mail",
    type: "email",
    required: true,
    map: "email",
    placeholder: "voce@empresa.com.br",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    type: "phone",
    required: false,
    map: "phone",
    placeholder: "(11) 99999-9999",
  },
];

// ------------------------------------------------------------------ landing page por blocos

export type LandingBlock =
  | { id: string; type: "hero"; title: string; subtitle?: string; cta?: string; image?: string }
  | { id: string; type: "features"; title?: string; items: { title: string; text: string }[] }
  | { id: string; type: "text"; title?: string; body: string }
  | { id: string; type: "form"; title?: string; subtitle?: string }
  | { id: string; type: "testimonial"; quote: string; author: string; role?: string }
  | { id: string; type: "faq"; title?: string; items: { q: string; a: string }[] }
  | { id: string; type: "cta"; title: string; button: string };

export const BLOCK_LABEL: Record<LandingBlock["type"], string> = {
  hero: "Capa (título e chamada)",
  features: "Benefícios",
  text: "Texto",
  form: "Formulário",
  testimonial: "Depoimento",
  faq: "Perguntas frequentes",
  cta: "Chamada final",
};

/** Valida os valores enviados contra os campos do formulário. Devolve erros por campo. */
export function validateSubmission(
  fields: FormField[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = values[f.key];
    const v = typeof raw === "string" ? raw.trim() : raw;
    const empty = v === undefined || v === null || v === "" || v === false;
    if (f.required && empty) {
      errors[f.key] = "Obrigatório";
      continue;
    }
    if (empty) continue;
    const s = String(v);
    if (s.length > 2000) errors[f.key] = "Muito longo";
    else if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s))
      errors[f.key] = "E-mail inválido";
    else if (f.type === "phone" && s.replace(/\D/g, "").length < 10)
      errors[f.key] = "Telefone com DDD";
    else if (f.type === "number" && !Number.isFinite(Number(s.replace(",", "."))))
      errors[f.key] = "Número inválido";
    else if (f.type === "select" && f.options && !f.options.includes(s))
      errors[f.key] = "Opção inválida";
  }
  return errors;
}

/** Converte respostas em colunas do contato e campos personalizados, conforme o mapeamento. */
export function mapToContact(fields: FormField[], values: Record<string, unknown>) {
  const contact: Record<string, string> = {};
  const custom: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.map) continue;
    const raw = values[f.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const v = typeof raw === "string" ? raw.trim() : raw;
    if (f.map.startsWith("custom."))
      custom[f.map.slice(7)] = f.type === "number" ? Number(String(v).replace(",", ".")) : v;
    else if (f.map === "email") contact["email"] = String(v).toLowerCase();
    else if (f.map === "phone") {
      const phone = normalizePhone(String(v));
      if (phone) contact["phone"] = phone;
    } else contact[f.map] = String(v).slice(0, 500);
  }
  return { contact, custom };
}

/** Campos de UTM aceitos (o resto é descartado). */
export function cleanUtm(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "fbclid",
  ]) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
  }
  return out;
}

/** Toque de atribuição a partir das UTMs e do referrer. */
export function touchFrom(
  utm: Record<string, string>,
  referrer: string | null,
  channel: string,
  at: string,
) {
  let source = utm["utm_source"] ?? null;
  let medium = utm["utm_medium"] ?? null;
  if (!source && utm["gclid"]) {
    source = "google";
    medium = "cpc";
  }
  if (!source && utm["fbclid"]) {
    source = "facebook";
    medium = medium ?? "social";
  }
  if (!source && referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, "");
      source = host;
      medium = /google|bing|duckduckgo|yahoo/.test(host)
        ? "organic"
        : /facebook|instagram|linkedin|t\.co|twitter|tiktok/.test(host)
          ? "social"
          : "referral";
    } catch {
      // referrer inválido: segue como direto
    }
  }
  return {
    source: source ?? "direto",
    medium: medium ?? "none",
    campaign: utm["utm_campaign"] ?? null,
    content: utm["utm_content"] ?? null,
    term: utm["utm_term"] ?? null,
    channel,
    at,
  };
}

/** Envio feito em menos de 2,5 s desde a abertura: sinal de robô (só marca, nunca descarta). */
export const MIN_HUMAN_MS = 2500;
export function isTooFast(startedAt: unknown, now: number): boolean {
  return typeof startedAt === "number" && now - startedAt < MIN_HUMAN_MS;
}
