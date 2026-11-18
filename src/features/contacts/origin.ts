// "De onde veio esse contato?" em português de gente, a partir do primeiro (ou último) toque.
// Puro: usado no selo da conversa, no cartão do contato e no relatório.
import { PLATFORM_LABEL } from "@/components/brand/platform-label";

export interface TouchLike {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  channel?: string | null;
  at?: string | null;
}

export interface OriginInfo {
  /** Rede ou site de origem ("Instagram", "Google"). */
  source: string;
  /** Plataforma para o ícone, quando é uma rede conhecida. */
  platform: string | null;
  /** Veio de anúncio pago. */
  paid: boolean;
  /** Frase curta para o selo: "Instagram · anúncio Promo implante". */
  short: string;
  /** Linhas do detalhe (campanha, anúncio, conjunto, por onde entrou). */
  details: { label: string; value: string }[];
}

const WEB_SOURCE: Record<string, string> = {
  facebook: "Facebook",
  fb: "Facebook",
  instagram: "Instagram",
  ig: "Instagram",
  google: "Google",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  direto: "Acesso direto",
  email: "E-mail",
  site: "Site",
  manual: "Cadastro manual",
  sms: "SMS",
  whatsapp: "WhatsApp",
  webchat: "Chat do site",
  form: "Formulário",
  import: "Importação",
  api: "Integração",
};

const ENTRY: Record<string, string> = {
  form: "formulário do site",
  landing: "página de captura",
  webchat: "chat do site",
  meta_ads: "formulário do anúncio",
  google_ads: "formulário do anúncio",
  api: "integração",
};

const PAID = new Set(["paid", "cpc", "ppc", "ads", "cpm", "paid_social"]);

export function describeOrigin(t: TouchLike | null | undefined): OriginInfo | null {
  const raw = (t?.source ?? "").trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  const fromMessage = Boolean(t?.channel && t.channel === raw && PLATFORM_LABEL[key]);
  const source = fromMessage ? PLATFORM_LABEL[key]! : (WEB_SOURCE[key] ?? raw);
  const platform = PLATFORM_LABEL[key] ? key : null;
  const medium = (t?.medium ?? "").toLowerCase();
  const paid = PAID.has(medium);
  const campaign = t?.campaign?.trim() || null;

  const kind = paid ? "anúncio" : medium === "referral" && campaign ? "link" : null;
  const short = [source, kind ? `${kind}${campaign ? ` ${campaign}` : ""}` : null]
    .filter(Boolean)
    .join(" · ");

  const details: OriginInfo["details"] = [];
  if (campaign) details.push({ label: paid ? "Campanha" : "Origem do link", value: campaign });
  if (t?.content && t.content !== campaign) details.push({ label: "Anúncio", value: t.content });
  if (t?.term) details.push({ label: "Público", value: t.term });
  const entry = t?.channel ? ENTRY[t.channel] : undefined;
  if (entry) details.push({ label: "Entrou por", value: entry });
  else if (fromMessage) details.push({ label: "Entrou por", value: `mensagem no ${source}` });

  return { source, platform, paid, short, details };
}
