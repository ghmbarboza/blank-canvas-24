import { BRAND_ICONS, type BrandIcon as BrandGlyph } from "./brand-icons";
import { TOOL_ICONS } from "./tool-icons";

// Componentes de marca do DS SUBIDO (kit/brand/brand-icon.tsx): toda ferramenta citada como opção
// ou conexão aparece com o logo oficial. Logo livre (Simple Icons, CC0) vira SVG na cor da marca;
// marca sem logo livre usa o ícone oficial baixado do site dela, em public/brand/marcas.

export const OFFICIAL_LOGOS: Record<string, { src: string; title: string }> = {
  evolution: { src: "/brand/marcas/evolution.png", title: "Evolution API" },
  zernio: { src: "/brand/marcas/zernio.svg", title: "Zernio" },
  outlook: { src: "/brand/marcas/outlook.png", title: "Outlook" },
  microsoft: { src: "/brand/marcas/microsoft-365.png", title: "Microsoft 365" },
  rdstation: { src: "/brand/marcas/rdstation.png", title: "RD Station CRM" },
  pipedrive: { src: "/brand/marcas/pipedrive.png", title: "Pipedrive" },
  kommo: { src: "/brand/marcas/kommo.png", title: "Kommo" },
  asaas: { src: "/brand/marcas/asaas.png", title: "Asaas" },
  slack: { src: "/brand/marcas/slack.png", title: "Slack" },
  googlemeet: { src: "/brand/marcas/google-meet.svg", title: "Google Meet" },
  zapsign: { src: "/brand/marcas/zapsign.png", title: "ZapSign" },
  zadarma: { src: "/brand/marcas/zadarma.svg", title: "Zadarma" },
  microsoftteams: { src: "/brand/marcas/microsoft-teams.png", title: "Microsoft Teams" },
  // Flow CRM é solução da Viver de IA: a marca dele é o monograma VIA
  flowcrm: { src: "/brand/via-monogram.png", title: "Flow CRM" },
};

// Apelidos que o código usa para a mesma marca.
export const ALIASES: Record<string, string> = {
  facebook_messenger: "messenger",
  meta_whatsapp: "whatsapp",
  whatsapp_cloud: "whatsapp",
  google_calendar: "googlecalendar",
  microsoft365: "microsoft",
  office365: "microsoft",
  ses: "aws",
  amazonses: "aws",
  rd: "rdstation",
  rd_station: "rdstation",
  claude: "anthropic",
  googlegemini: "gemini",
  turnstile: "cloudflare",
  meta_leads: "meta",
  google_leads: "google_ads",
  teams: "microsoftteams",
};

export function resolve(id: string): string {
  const key = id.toLowerCase();
  return ALIASES[key] ?? key;
}

export function glyph(id: string): BrandGlyph | undefined {
  return TOOL_ICONS[id] ?? BRAND_ICONS[id];
}

/** Nome oficial da marca, quando conhecido. */
export function brandTitle(id: string): string | undefined {
  const key = resolve(id);
  return OFFICIAL_LOGOS[key]?.title ?? glyph(key)?.label;
}

/** Se existe logo oficial para a marca (para decidir entre logo e ícone de função). */
export function hasBrandLogo(id: string): boolean {
  const key = resolve(id);
  return Boolean(OFFICIAL_LOGOS[key] ?? glyph(key));
}
