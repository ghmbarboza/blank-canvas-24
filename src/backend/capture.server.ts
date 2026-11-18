// Captação: um lead que chega (formulário, landing, anúncio da Meta, chat do site) vira contato
// com consentimento provado, primeiro/último toque, responsável, negócio e evento form.submitted.
import { createHash, randomBytes } from "node:crypto";

import { HttpError, admin, appBaseUrl } from "@/backend/http.server";
import { qualifiesForSchedule, scheduleRule } from "@/features/forms/schedule";
import {
  mapToContact,
  touchFrom,
  validateSubmission,
  type FormConsent,
  type FormDestination,
  type FormField,
} from "@/features/forms/types";
import type { Json } from "@/integrations/supabase/types";

export function ipHash(accountId: string, ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${accountId}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

/** Linhas de consentimento que o visitante aceitou (vazio se o formulário não pede ou ele não marcou). */
export function consentRows(
  consent: FormConsent,
  granted: boolean,
  proof: Record<string, unknown>,
): { channel: string; proof: Record<string, unknown> }[] {
  if (!consent.enabled || !granted) return [];
  return consent.channels.map((channel) => ({ channel, proof: { ...proof, text: consent.text } }));
}

interface CaptureResult {
  submission_id: string;
  contact_id: string;
  created: boolean;
  duplicated: boolean;
  owner: string | null;
}

export interface SubmitMeta {
  ip: string | null;
  userAgent: string | null;
  referrer: string | null;
  pageUrl: string | null;
  utm: Record<string, string>;
  source: "form" | "landing" | "meta_ads" | "google_ads" | "api" | "webchat";
  externalId?: string | null;
  consentGranted: boolean;
  visitorId?: string | null;
  /** sinal de robô (envio rápido demais): grava marcado, nunca descarta */
  suspect?: boolean;
}

/** Processa o envio de um formulário (público ou importado). Idempotente por external_id. */
export async function submitForm(
  formId: string,
  values: Record<string, unknown>,
  meta: SubmitMeta,
) {
  const db = admin();
  const { data: form } = await db.from("forms").select("*").eq("id", formId).maybeSingle();
  if (!form || form.status !== "active")
    throw new HttpError(404, "Formulário indisponível", "form_inactive");
  const fields = (form.fields as unknown as FormField[]) ?? [];
  const consent = form.consent as unknown as FormConsent;
  const dest = {
    owner_mode: "none",
    users: [],
    create_deal: false,
    tags: [],
    ...(form.destination as object),
  } as FormDestination;

  const errors = validateSubmission(fields, values);
  if (Object.keys(errors).length)
    throw new HttpError(
      422,
      Object.entries(errors)
        .map(([k, v]) => `${fields.find((f) => f.key === k)?.label ?? k}: ${v}`)
        .join("; "),
      "invalid",
    );
  if (consent.enabled && consent.required && !meta.consentGranted)
    throw new HttpError(422, "É preciso aceitar os termos para enviar", "consent_required");

  const ih = ipHash(form.account_id, meta.ip);
  if (ih) {
    const { count } = await db
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ih)
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if ((count ?? 0) >= 10)
      throw new HttpError(
        429,
        "Muitos envios seguidos. Tente de novo em alguns minutos.",
        "rate_limited",
      );
  }

  const { contact, custom } = mapToContact(fields, values);
  if (!contact["email"] && !contact["phone"] && !contact["name"])
    throw new HttpError(422, "Informe ao menos nome, e-mail ou telefone", "invalid");
  const at = new Date().toISOString();
  const touch = touchFrom(meta.utm, meta.referrer, meta.source, at);
  const confirmToken = randomBytes(18).toString("hex");
  // Contato + envio + consentimento + origem numa transação só (RPC). Se a conexão cair, ou grava
  // tudo ou nada; o mesmo visitante reenviando o mesmo conteúdo recebe o envio já gravado.
  const { data: captured, error: capErr } = await (
    db.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: CaptureResult | null; error: { message: string } | null }>
  )("capture_form_submission", {
    _form: form.id,
    _contact: contact,
    _custom: custom,
    _touch: touch,
    _contact_source:
      meta.source === "meta_ads" || meta.source === "google_ads" ? meta.source : "form",
    _submission: {
      atomic_version: 2,
      source: meta.source,
      payload: values,
      utm: meta.utm,
      referrer: meta.referrer,
      page_url: meta.pageUrl,
      ip_hash: ih,
      user_agent: meta.userAgent,
      confirm_token: confirmToken,
      confirmation_base_url: appBaseUrl(),
      external_id: meta.externalId ?? null,
      suspect: meta.suspect === true,
    },
    _consent: consentRows(consent, meta.consentGranted, {
      source: meta.source,
      form_id: form.id,
      ip_hash: ih,
      user_agent: meta.userAgent?.slice(0, 300) ?? null,
      page_url: meta.pageUrl,
      at,
    }),
    _visitor: meta.visitorId ?? null,
  });
  if (capErr || !captured) {
    console.error("[capture] capture_form_submission", capErr?.message);
    throw new HttpError(500, "Não deu para registrar o envio. Tente de novo.", "submission");
  }
  // Os efeitos comerciais e a confirmação pendente já estão persistidos na mesma transação.
  // Sem dono explícito, o outbox mantém o roteamento mesmo que esta conexão caia.
  const owner = captured.owner;
  const schedule = await scheduleLink(form.account_id, dest.schedule, values, owner);
  return {
    submissionId: captured.submission_id,
    contactId: captured.contact_id,
    duplicated: captured.duplicated,
    form,
    schedule,
  };
}

/** Envio qualificado → link da agenda (página fixa da regra ou a página ativa do dono escolhido). */
async function scheduleLink(
  accountId: string,
  raw: unknown,
  values: Record<string, unknown>,
  owner: string | null,
): Promise<{ url: string; label: string } | null> {
  const rule = scheduleRule(raw);
  if (!qualifiesForSchedule(rule, values)) return null;
  const db = admin();
  let slug: string | null = null;
  if (rule.booking_slug) {
    const { data } = await db
      .from("booking_pages")
      .select("slug")
      .eq("account_id", accountId)
      .eq("slug", rule.booking_slug)
      .eq("is_active", true)
      .maybeSingle();
    slug = data?.slug ?? null;
  }
  if (!slug && owner) {
    const { data } = await db
      .from("booking_pages")
      .select("slug")
      .eq("account_id", accountId)
      .eq("owner_user_id", owner)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    slug = data?.slug ?? null;
  }
  return slug ? { url: `${appBaseUrl()}/agendar/${slug}`, label: rule.label } : null;
}

export function publicForm(form: {
  id: string;
  title: string | null;
  name: string;
  description: string | null;
  fields: Json;
  consent: Json;
  submit_label: string;
  theme: Json;
}) {
  return {
    id: form.id,
    title: form.title ?? form.name,
    description: form.description,
    fields: (form.fields as unknown as FormField[]).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      placeholder: f.placeholder,
      options: f.options,
      default: f.default,
      map: null,
    })),
    consent: form.consent,
    submit_label: form.submit_label,
    theme: form.theme,
  };
}
