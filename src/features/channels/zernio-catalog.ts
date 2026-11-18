// Tudo o que a chave única da Zernio conecta: mensagens, redes sociais, contas de anúncio e
// agenda/e-mail (Google e Microsoft, com o OAuth feito pela própria Zernio).
// Sem rede (testável). `accountPlatforms` é como a conta aparece em GET /v1/accounts; `connect`
// diz como abrir o cadastro da própria Zernio (lista oficial em connect_get_connect_url e
// connect_ads, conferida em 04/11/2026).

export type ZernioGroup = "mensagens" | "redes" | "anuncios" | "agenda";

export interface ZernioOption {
  id: string;
  label: string;
  group: ZernioGroup;
  /** Ícone (ChannelIcon/BrandIcon). */
  icon: string;
  /** Plataformas em /v1/accounts que contam como "conectado". */
  accountPlatforms: string[];
  connect:
    | { kind: "whatsapp" }
    | { kind: "social"; platform: string }
    | { kind: "ads"; platform: string }
    | { kind: "workspace"; platform: "google" | "microsoft"; scopes: string };
  hint: string;
}

export const ZERNIO_GROUPS: { id: ZernioGroup; label: string; hint: string }[] = [
  {
    id: "mensagens",
    label: "Mensagens",
    hint: "As conversas caem na Caixa de entrada e o agente de IA do canal responde.",
  },
  { id: "redes", label: "Redes sociais", hint: "Comentários, menções e DMs onde a rede libera." },
  {
    id: "anuncios",
    label: "Anúncios",
    hint: "Leads, campanhas e resultados de cada rede de anúncio.",
  },
  {
    id: "agenda",
    label: "Agenda e e-mail",
    hint: "A agenda de quem atende bloqueia os horários ocupados nos links de agendamento.",
  },
];

export const ZERNIO_OPTIONS: ZernioOption[] = [
  // mensagens
  {
    id: "whatsapp",
    label: "WhatsApp",
    group: "mensagens",
    icon: "whatsapp",
    accountPlatforms: ["whatsapp"],
    connect: { kind: "whatsapp" },
    hint: "Número oficial da Meta, vários atendentes no mesmo número.",
  },
  {
    id: "instagram",
    label: "Instagram",
    group: "mensagens",
    icon: "instagram",
    accountPlatforms: ["instagram"],
    connect: { kind: "social", platform: "instagram" },
    hint: "DMs, comentários e stories.",
  },
  {
    id: "facebook",
    label: "Messenger",
    group: "mensagens",
    icon: "facebook",
    accountPlatforms: ["facebook"],
    connect: { kind: "social", platform: "facebook" },
    hint: "Mensagens e comentários da página.",
  },
  {
    id: "telegram",
    label: "Telegram",
    group: "mensagens",
    icon: "telegram",
    accountPlatforms: ["telegram"],
    connect: { kind: "social", platform: "telegram" },
    hint: "Bot do Telegram da empresa.",
  },
  // redes
  {
    id: "tiktok",
    label: "TikTok",
    group: "redes",
    icon: "tiktok",
    accountPlatforms: ["tiktok"],
    connect: { kind: "social", platform: "tiktok" },
    hint: "DMs recebidas e comentários (conta Business).",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    group: "redes",
    icon: "linkedin",
    accountPlatforms: ["linkedin"],
    connect: { kind: "social", platform: "linkedin" },
    hint: "Comentários da página da empresa.",
  },
  {
    id: "twitter",
    label: "X",
    group: "redes",
    icon: "x",
    accountPlatforms: ["twitter", "x"],
    connect: { kind: "social", platform: "twitter" },
    hint: "DMs e comentários dos seus posts.",
  },
  {
    id: "youtube",
    label: "YouTube",
    group: "redes",
    icon: "youtube",
    accountPlatforms: ["youtube"],
    connect: { kind: "social", platform: "youtube" },
    hint: "Comentários dos vídeos.",
  },
  {
    id: "threads",
    label: "Threads",
    group: "redes",
    icon: "threads",
    accountPlatforms: ["threads"],
    connect: { kind: "social", platform: "threads" },
    hint: "Respostas aos seus posts.",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    group: "redes",
    icon: "pinterest",
    accountPlatforms: ["pinterest"],
    connect: { kind: "social", platform: "pinterest" },
    hint: "Perfil e pins da empresa.",
  },
  {
    id: "reddit",
    label: "Reddit",
    group: "redes",
    icon: "reddit",
    accountPlatforms: ["reddit"],
    connect: { kind: "social", platform: "reddit" },
    hint: "Mensagens e comentários.",
  },
  {
    id: "bluesky",
    label: "Bluesky",
    group: "redes",
    icon: "bluesky",
    accountPlatforms: ["bluesky"],
    connect: { kind: "social", platform: "bluesky" },
    hint: "Mensagens e comentários.",
  },
  {
    id: "googlebusiness",
    label: "Google Business",
    group: "redes",
    icon: "google_business",
    accountPlatforms: ["googlebusiness", "google_business"],
    connect: { kind: "social", platform: "googlebusiness" },
    hint: "Perfil da Empresa no Google e avaliações.",
  },
  // anúncios
  {
    id: "metaads",
    label: "Meta Ads",
    group: "anuncios",
    icon: "facebook",
    accountPlatforms: ["metaads"],
    connect: { kind: "ads", platform: "facebook" },
    hint: "Facebook e Instagram Ads: leads dos formulários e campanhas.",
  },
  {
    id: "googleads",
    label: "Google Ads",
    group: "anuncios",
    icon: "googleads",
    accountPlatforms: ["googleads"],
    connect: { kind: "ads", platform: "googleads" },
    hint: "Pesquisa, Display, Performance Max e leads.",
  },
  {
    id: "tiktokads",
    label: "TikTok Ads",
    group: "anuncios",
    icon: "tiktok",
    accountPlatforms: ["tiktokads"],
    connect: { kind: "ads", platform: "tiktok" },
    hint: "Campanhas e Spark Ads.",
  },
  {
    id: "linkedinads",
    label: "LinkedIn Ads",
    group: "anuncios",
    icon: "linkedin",
    accountPlatforms: ["linkedinads"],
    connect: { kind: "ads", platform: "linkedin" },
    hint: "Campanhas e leads do Lead Gen Forms.",
  },
  {
    id: "pinterestads",
    label: "Pinterest Ads",
    group: "anuncios",
    icon: "pinterest",
    accountPlatforms: ["pinterestads"],
    connect: { kind: "ads", platform: "pinterest" },
    hint: "Campanhas e pins promovidos.",
  },
  {
    id: "xads",
    label: "X Ads",
    group: "anuncios",
    icon: "x",
    accountPlatforms: ["xads"],
    connect: { kind: "ads", platform: "twitter" },
    hint: "Campanhas e posts promovidos.",
  },
  {
    id: "redditads",
    label: "Reddit Ads",
    group: "anuncios",
    icon: "reddit",
    accountPlatforms: ["redditads"],
    connect: { kind: "ads", platform: "redditads" },
    hint: "Campanhas no Reddit.",
  },
  {
    id: "microsoftads",
    label: "Microsoft Ads",
    group: "anuncios",
    icon: "microsoft",
    accountPlatforms: ["microsoftads"],
    connect: { kind: "ads", platform: "microsoftads" },
    hint: "Bing e rede Microsoft.",
  },
  // agenda e e-mail (OAuth do Google e da Microsoft feito pela própria Zernio)
  {
    id: "google",
    label: "Google Agenda e Gmail",
    group: "agenda",
    icon: "google",
    accountPlatforms: ["google"],
    connect: { kind: "workspace", platform: "google", scopes: "email,calendar" },
    hint: "Conecte o e-mail Google de quem atende: os compromissos dele ficam ocupados.",
  },
  {
    id: "microsoft",
    label: "Outlook e Microsoft 365",
    group: "agenda",
    icon: "microsoft",
    accountPlatforms: ["microsoft"],
    connect: { kind: "workspace", platform: "microsoft", scopes: "email,calendar" },
    hint: "Conta de trabalho, escola ou pessoal da Microsoft, com a agenda do Outlook.",
  },
];

/** Plataformas que são conta de anúncio (não viram canal de atendimento). */
export const ADS_PLATFORMS = new Set(
  ZERNIO_OPTIONS.filter((o) => o.group === "anuncios").flatMap((o) => o.accountPlatforms),
);

export function isAdsPlatform(platform: string | undefined): boolean {
  return Boolean(platform && (ADS_PLATFORMS.has(platform) || /ads$/.test(platform)));
}

/** Caixas de e-mail e agenda (Google, Microsoft): servem à agenda, não viram canal de atendimento. */
export const WORKSPACE_PLATFORMS = new Set(
  ZERNIO_OPTIONS.filter((o) => o.group === "agenda").flatMap((o) => o.accountPlatforms),
);

/** Conta da Zernio que vira canal na Caixa de entrada (nem anúncio, nem agenda). */
export function isServiceChannelPlatform(platform: string | undefined): boolean {
  return Boolean(platform) && !isAdsPlatform(platform) && !WORKSPACE_PLATFORMS.has(platform!);
}

export interface ZernioAccountLite {
  id: string;
  platform: string;
  name: string;
  active: boolean;
}

export interface OptionState {
  option: ZernioOption;
  accounts: ZernioAccountLite[];
  status: "connected" | "problem" | "none";
}

/** Junta o catálogo com o que a Zernio diz que está conectado (ativo, com problema ou nada). */
export function optionStates(accounts: ZernioAccountLite[]): OptionState[] {
  return ZERNIO_OPTIONS.map((option) => {
    const mine = accounts.filter((a) => option.accountPlatforms.includes(a.platform));
    const status = mine.some((a) => a.active) ? "connected" : mine.length ? "problem" : "none";
    return { option, accounts: mine, status };
  });
}

export function findOption(id: string): ZernioOption | undefined {
  return ZERNIO_OPTIONS.find((o) => o.id === id);
}

export const zernioHubKey = (accountId: string) => ["zernio-hub", accountId] as const;
