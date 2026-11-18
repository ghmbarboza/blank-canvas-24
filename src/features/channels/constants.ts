export const PROVIDER_LABEL: Record<string, string> = {
  whatsapp_cloud: "App próprio na Meta",
  evolution: "WhatsApp por QR Code",
  zernio: "via Zernio",
  zadarma: "SMS pela Zadarma",
  email: "E-mail",
  webchat: "Chat do site",
};

export function providerLabel(provider: string, platform: string): string {
  if (provider === "zernio" && platform === "whatsapp") return "WhatsApp oficial via Zernio";
  return PROVIDER_LABEL[provider] ?? provider;
}

/**
 * Marca da ferramenta por trás do canal, quando a plataforma sozinha não diz (SMS pela Zadarma,
 * e-mail pelo Gmail ou Outlook). Sem marca conhecida, o cartão usa o ícone da plataforma.
 */
export function channelBrand(channel: {
  provider: string;
  platform: string;
  name?: string | null;
  config?: unknown;
}): string | null {
  if (channel.provider === "zadarma") return "zadarma";
  if (channel.platform !== "email") return null;
  const cfg = channel.config;
  const toolkit =
    cfg && typeof cfg === "object" && "toolkit" in cfg
      ? (cfg as { toolkit?: unknown }).toolkit
      : null;
  if (toolkit === "gmail" || toolkit === "outlook") return toolkit;
  // canal antigo sem toolkit no config: o nome dado na conexão diz a caixa
  const name = channel.name ?? "";
  if (/gmail/i.test(name)) return "gmail";
  if (/outlook|microsoft/i.test(name)) return "outlook";
  return null;
}

export interface StatusMeta {
  label: string;
  dot: string;
  text: string;
  pulse: boolean;
}

export const CHANNEL_STATUS: Record<string, StatusMeta> = {
  connected: { label: "Conectado", dot: "bg-success", text: "text-foreground", pulse: false },
  connecting: { label: "Conectando", dot: "bg-warm", text: "text-warm-fg", pulse: true },
  pending: { label: "Aguardando", dot: "bg-warm", text: "text-warm-fg", pulse: true },
  disconnected: {
    label: "Desconectado",
    dot: "bg-subtle",
    text: "text-muted-foreground",
    pulse: false,
  },
  error: { label: "Erro", dot: "bg-danger", text: "text-danger", pulse: false },
};

export function statusMeta(status: string): StatusMeta {
  return CHANNEL_STATUS[status] ?? CHANNEL_STATUS["disconnected"]!;
}

export type SocialCapability = "dm" | "comments" | "profile";

export interface SocialNetwork {
  // Nome que a Zernio espera em /connect/{platform}
  zernio: string;
  // channels.platform (o que o ChannelIcon entende)
  platform: string;
  label: string;
  capability: SocialCapability;
  hint: string;
}

export const CAPABILITY_LABEL: Record<SocialCapability, string> = {
  dm: "Mensagens diretas",
  comments: "Só comentários",
  profile: "Perfil da empresa",
};

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  {
    zernio: "instagram",
    platform: "instagram",
    label: "Instagram",
    capability: "dm",
    hint: "Responde DMs e comentários. Passadas 24 h da última mensagem do cliente, só com a etiqueta de atendimento humano.",
  },
  {
    zernio: "facebook",
    platform: "facebook",
    label: "Messenger",
    capability: "dm",
    hint: "Mensagens do Messenger e comentários da página. Vale a mesma janela de 24 h do Instagram.",
  },
  {
    zernio: "tiktok",
    platform: "tiktok",
    label: "TikTok",
    capability: "dm",
    hint: "Responde DMs recebidas (até 10 mensagens em 48 h); não inicia conversa. Precisa de conta Business.",
  },
  {
    zernio: "telegram",
    platform: "telegram",
    label: "Telegram",
    capability: "dm",
    hint: "Mensagens diretas com texto, imagem, vídeo e documento.",
  },
  {
    zernio: "twitter",
    platform: "x",
    label: "X",
    capability: "dm",
    hint: "Mensagens diretas e comentários nos seus posts.",
  },
  {
    zernio: "reddit",
    platform: "reddit",
    label: "Reddit",
    capability: "dm",
    hint: "Mensagens diretas só de texto, além de comentários.",
  },
  {
    zernio: "bluesky",
    platform: "bluesky",
    label: "Bluesky",
    capability: "dm",
    hint: "Mensagens diretas só de texto, além de comentários.",
  },
  {
    zernio: "linkedin",
    platform: "linkedin",
    label: "LinkedIn",
    capability: "comments",
    hint: "A API do LinkedIn não libera DMs para ferramentas de terceiros; comentários das páginas entram aqui.",
  },
  {
    zernio: "threads",
    platform: "threads",
    label: "Threads",
    capability: "comments",
    hint: "O Threads não tem DM pela API; respostas aos seus posts entram aqui.",
  },
  {
    zernio: "youtube",
    platform: "youtube",
    label: "YouTube",
    capability: "comments",
    hint: "O YouTube não tem mensagens diretas; comentários dos seus vídeos entram aqui.",
  },
  {
    zernio: "googlebusiness",
    platform: "google_business",
    label: "Google Business",
    capability: "profile",
    hint: "Conecta o Perfil da Empresa no Google. O Google encerrou o chat do perfil em 2024, então não há mensagens diretas.",
  },
];

// Polling do QR: a cada 3 s, por no máximo 3 min.
export const QR_POLL_MS = 3000;
export const QR_POLL_MAX_MS = 3 * 60 * 1000;
