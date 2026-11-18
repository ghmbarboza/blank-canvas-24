// Edição do produto, num lugar só. O código dos outros canais continua no repositório (rotas,
// telas, servidor); esta configuração só decide o que a INTERFACE mostra. Para religar um canal,
// acrescente-o em `EDITION.channels` (ou use `FULL_EDITION`): nada precisa ser reescrito.
//
// Hoje o produto tem DOIS canais: WhatsApp por QR Code (Evolution API) e Instagram (pela Zernio).
// O que cada canal ausente esconde:
// - "phone": botão Ligar e ligação com IA (contato, conversa, ficha, negócio, fila), discador
//   flutuante, menu Ligações, aba Telefonia em Ajustes, agentes e campanhas de voz, passo
//   "ligação" das automações.
// - "sms": passo de SMS nas automações e nas cadências.
// - "video": menu Reuniões, criar/entrar em reunião, link de sala.
// - "email": e-mail como canal de atendimento, Campanhas de e-mail, aba E-mail em Ajustes, envio
//   de pesquisa por e-mail, passo de e-mail nas automações e os modelos prontos que dependem dele.
// - "whatsapp_official": número oficial da Meta pela Zernio, modelos aprovados e Campanhas de
//   WhatsApp (que só disparam por modelo aprovado do número oficial).
// - "messenger", "telegram", "tiktok", "x", "linkedin", "threads", "youtube", "webchat": o canal
//   em Canais, filtros e opções de formulário.
// Integrações: só aparecem as que os canais da edição precisam (ver `hasProvider`). A chave
// própria de IA segue `ownAiKey` (a IA já vem inclusa).
export const ALL_CHANNELS = [
  "whatsapp_qr",
  "instagram",
  "whatsapp_official",
  "messenger",
  "telegram",
  "tiktok",
  "x",
  "linkedin",
  "threads",
  "youtube",
  "webchat",
  "email",
  "phone",
  "sms",
  "video",
] as const;

export type EditionChannel = (typeof ALL_CHANNELS)[number];

export interface Edition {
  /** Canais que a interface oferece. O que não está aqui some de menu, botões, abas e textos. */
  channels: readonly EditionChannel[];
  /** Mostrar "usar minha própria chave de IA" (OpenAI/Anthropic) e as demais integrações. */
  ownAiKey: boolean;
  /** Mostrar todas as integrações (CRM externo, cobrança, voz...), não só as dos canais. */
  allIntegrations: boolean;
}

export const EDITION: Edition = {
  channels: ["whatsapp_qr", "instagram"],
  ownAiKey: false,
  allIntegrations: false,
};

/** Edição completa (todos os canais e integrações), para testes e para comparar os estados. */
export const FULL_EDITION: Edition = {
  channels: ALL_CHANNELS,
  ownAiKey: true,
  allIntegrations: true,
};

/** A edição oferece este canal? */
export function hasChannel(channel: EditionChannel, edition: Edition = EDITION): boolean {
  return edition.channels.includes(channel);
}

/** Canais que passam pela Zernio (a chave dela só aparece se algum estiver na edição). */
const ZERNIO_CHANNELS: readonly EditionChannel[] = [
  "instagram",
  "whatsapp_official",
  "messenger",
  "telegram",
  "tiktok",
  "x",
  "linkedin",
  "threads",
  "youtube",
];

/** Integração que cada canal exige. Fora desta lista, só aparece com `allIntegrations`. */
const PROVIDER_CHANNELS: Record<string, readonly EditionChannel[]> = {
  evolution: ["whatsapp_qr"],
  zernio: ZERNIO_CHANNELS,
};

/** A integração (id do provedor) aparece nesta edição? */
export function hasProvider(providerId: string, edition: Edition = EDITION): boolean {
  if (edition.allIntegrations) return true;
  const channels = PROVIDER_CHANNELS[providerId];
  return Boolean(channels?.some((c) => hasChannel(c, edition)));
}

/** Plataforma de conversa (valor de `channels.platform` / `conversations.platform`) e o canal dela. */
const PLATFORM_CHANNEL: Record<string, EditionChannel> = {
  instagram: "instagram",
  facebook: "messenger",
  messenger: "messenger",
  telegram: "telegram",
  tiktok: "tiktok",
  twitter: "x",
  x: "x",
  linkedin: "linkedin",
  threads: "threads",
  youtube: "youtube",
  webchat: "webchat",
  email: "email",
  sms: "sms",
  voice: "phone",
  phone: "phone",
};

/** A plataforma de mensagem aparece nesta edição? WhatsApp vale com QR Code ou número oficial. */
export function hasPlatform(platform: string, edition: Edition = EDITION): boolean {
  if (platform === "whatsapp")
    return hasChannel("whatsapp_qr", edition) || hasChannel("whatsapp_official", edition);
  const channel = PLATFORM_CHANNEL[platform];
  // plataforma desconhecida: não esconde (melhor mostrar um dado real do que sumir com ele)
  return channel ? hasChannel(channel, edition) : true;
}

/** Telas que saem do ar quando nenhum dos canais delas está na edição. */
const CHANNEL_ROUTES: { prefix: string; anyOf: EditionChannel[]; except?: string[] }[] = [
  { prefix: "/ligacoes", anyOf: ["phone"] },
  { prefix: "/reunioes", anyOf: ["video"] },
  { prefix: "/campanhas/whatsapp", anyOf: ["whatsapp_official"] },
  { prefix: "/campanhas", anyOf: ["email"], except: ["/campanhas/whatsapp"] },
  // a Biblioteca só guarda trechos de ligações e reuniões gravadas
  { prefix: "/biblioteca", anyOf: ["phone", "video"] },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** O endereço pertence a uma tela escondida nesta edição? */
export function isRouteHidden(pathname: string, edition: Edition = EDITION): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return CHANNEL_ROUTES.some(
    (r) =>
      under(path, r.prefix) &&
      !(r.except ?? []).some((e) => under(path, e)) &&
      !r.anyOf.some((c) => hasChannel(c, edition)),
  );
}
