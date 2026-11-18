// Catálogo de integrações da plataforma (compartilhado entre a tela e o servidor).
// Campo `secret` vai para o Vault (nunca para a coluna config, que membros leem).
export type ProviderId =
  | "openai"
  | "anthropic"
  | "resend"
  | "livekit"
  | "deepgram"
  | "zadarma"
  | "elevenlabs"
  | "asaas"
  | "google"
  | "microsoft"
  | "meta_leads"
  | "zapsign"
  | "turnstile"
  | "google_leads"
  | "ses"
  | "flowcrm";

export interface ProviderField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
}

export interface ProviderDef {
  id: ProviderId;
  name: string;
  category:
    | "Inteligência artificial"
    | "E-mail"
    | "Reuniões"
    | "Telefonia e voz"
    | "Transcrição"
    | "Pagamentos"
    | "Agenda e e-mail"
    | "Captação"
    | "Contratos"
    | "CRM"
    | "Segurança";
  description: string;
  docs: string;
  fields: ProviderField[];
  testable: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "Inteligência artificial",
    description:
      "Sua própria chave da OpenAI. A IA da Central de CS passa a usar a sua conta, com o seu limite e a sua fatura.",
    docs: "https://platform.openai.com/api-keys",
    testable: true,
    fields: [{ key: "api_key", label: "Chave da API", secret: true, placeholder: "sk-..." }],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    category: "Inteligência artificial",
    description:
      "Sua própria chave da Anthropic. O Claude responde no lugar da IA inclusa, com a sua fatura.",
    docs: "https://console.anthropic.com/settings/keys",
    testable: true,
    fields: [{ key: "api_key", label: "Chave da API", secret: true, placeholder: "sk-ant-..." }],
  },
  {
    id: "resend",
    name: "Resend",
    category: "E-mail",
    description:
      "Envio de convites, lembretes, e-mail 1:1 e campanhas, com rastreio de abertura e descadastro em um clique.",
    docs: "https://resend.com/docs",
    testable: true,
    fields: [
      { key: "api_key", label: "Chave da API", secret: true, placeholder: "re_..." },
      {
        key: "from_email",
        label: "Remetente",
        placeholder: "contato@suaempresa.com.br",
        help: "O domínio precisa estar verificado no Resend.",
      },
      { key: "from_name", label: "Nome do remetente", placeholder: "Sua Empresa" },
      {
        key: "reply_to",
        label: "Responder para",
        placeholder: "comercial@suaempresa.com.br",
        optional: true,
      },
      {
        key: "webhook_secret",
        label: "Segredo do webhook",
        secret: true,
        optional: true,
        help: "Para registrar entrega, bounce e reclamação. Webhook: /api/public/resend",
      },
    ],
  },
  {
    id: "livekit",
    name: "LiveKit",
    category: "Reuniões",
    description:
      "Sala de reunião própria, com vídeo, transcrição ao vivo e coach durante a reunião.",
    docs: "https://docs.livekit.io/home/self-hosting/deployment/",
    testable: true,
    fields: [
      { key: "url", label: "URL do servidor", placeholder: "wss://meet.suaempresa.com.br" },
      { key: "api_key", label: "API key", placeholder: "API..." },
      { key: "api_secret", label: "API secret", secret: true },
      {
        key: "record",
        label: "Gravação",
        options: [
          { value: "audio", label: "Só áudio (padrão)" },
          { value: "video", label: "Vídeo composto" },
          { value: "off", label: "Não gravar" },
        ],
        optional: true,
      },
    ],
  },
  {
    id: "deepgram",
    name: "Deepgram",
    category: "Transcrição",
    description:
      "Opcional. A transcrição já vem pela IA inclusa; o Deepgram serve para separar quem falou e para o coach ao vivo na ligação.",
    docs: "https://developers.deepgram.com",
    testable: true,
    fields: [{ key: "api_key", label: "Chave da API", secret: true }],
  },
  {
    id: "zadarma",
    name: "Zadarma",
    category: "Telefonia e voz",
    description:
      "Números brasileiros, softphone no navegador, URA, filas, gravação e ligação da IA de voz.",
    docs: "https://zadarma.com/en/support/api/",
    testable: true,
    fields: [
      { key: "api_key", label: "Key", secret: true },
      { key: "api_secret", label: "Secret", secret: true },
      {
        key: "caller_id",
        label: "Número de saída (CallerID)",
        placeholder: "+5548...",
        optional: true,
      },
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    category: "Telefonia e voz",
    description:
      "Agente de voz com IA (Eleven v4 Turbo) para SAC, qualificação e campanhas de ligação.",
    docs: "https://elevenlabs.io/docs/agents-platform/overview",
    testable: true,
    fields: [
      { key: "api_key", label: "Chave da API", secret: true },
      {
        key: "webhook_secret",
        label: "Segredo do webhook pós-chamada",
        secret: true,
        optional: true,
      },
    ],
  },
  {
    id: "asaas",
    name: "Asaas",
    category: "Pagamentos",
    description:
      "Link de Pix, boleto e cartão direto da proposta; o pagamento confirmado marca o negócio como ganho.",
    docs: "https://docs.asaas.com",
    testable: true,
    fields: [
      { key: "api_key", label: "Chave da API", secret: true },
      {
        key: "environment",
        label: "Ambiente",
        options: [
          { value: "sandbox", label: "Sandbox (teste)" },
          { value: "production", label: "Produção" },
        ],
      },
      {
        key: "webhook_token",
        label: "Token do webhook",
        secret: true,
        optional: true,
        help: "Webhook: /api/public/asaas?a=<sua conta> (o endereço completo aparece no guia)",
      },
    ],
  },
  {
    id: "google",
    name: "Google (Agenda e Gmail)",
    category: "Agenda e e-mail",
    description:
      "Sincronizar a agenda do vendedor (livre/ocupado) e enviar e-mail pelo Gmail dele.",
    docs: "https://developers.google.com/calendar/api",
    testable: false,
    fields: [
      { key: "client_id", label: "Client ID" },
      { key: "client_secret", label: "Client secret", secret: true },
    ],
  },
  {
    id: "microsoft",
    name: "Microsoft (Outlook)",
    category: "Agenda e e-mail",
    description: "Agenda e e-mail do Outlook / Microsoft 365 pelo Microsoft Graph.",
    docs: "https://learn.microsoft.com/graph/overview",
    testable: false,
    fields: [
      { key: "client_id", label: "Application (client) ID" },
      { key: "client_secret", label: "Client secret", secret: true },
      { key: "tenant", label: "Tenant", placeholder: "common", optional: true },
    ],
  },
  {
    id: "meta_leads",
    name: "Meta Lead Ads",
    category: "Captação",
    description:
      "Leads dos formulários de anúncio do Facebook e Instagram entram direto na Central de CS, com campanha e anúncio.",
    docs: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads",
    testable: false,
    fields: [
      { key: "page_token", label: "Token da página", secret: true },
      {
        key: "verify_token",
        label: "Token de verificação do webhook",
        secret: true,
        help: "Webhook: /api/public/meta-leads",
      },
      { key: "app_secret", label: "App secret", secret: true },
    ],
  },
  {
    id: "zapsign",
    name: "ZapSign",
    category: "Contratos",
    description:
      "Assinatura eletrônica da proposta com validade jurídica; quando o cliente assina, o negócio é atualizado sozinho.",
    docs: "https://docs.zapsign.com.br",
    testable: true,
    fields: [
      { key: "api_token", label: "Token da API", secret: true },
      {
        key: "environment",
        label: "Ambiente",
        options: [
          { value: "sandbox", label: "Sandbox (teste)" },
          { value: "production", label: "Produção" },
        ],
      },
      {
        key: "webhook_token",
        label: "Token do webhook",
        secret: true,
        help: "Invente um código e use no webhook da ZapSign: /api/public/zapsign?account=SUA_CONTA&t=TOKEN",
      },
    ],
  },
  {
    id: "ses",
    name: "Amazon SES",
    category: "E-mail",
    description:
      "Alternativa ao Resend para enviar convites, e-mail 1:1 e campanhas pela sua conta da AWS. O Resend continua o padrão até você ativar o SES aqui.",
    docs: "https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html",
    testable: true,
    fields: [
      {
        key: "active",
        label: "Provedor de envio",
        options: [
          { value: "no", label: "Resend continua enviando" },
          { value: "yes", label: "Enviar pelo Amazon SES" },
        ],
        optional: true,
      },
      { key: "access_key_id", label: "Access key ID", secret: true, placeholder: "AKIA..." },
      { key: "secret_access_key", label: "Secret access key", secret: true },
      {
        key: "region",
        label: "Região",
        placeholder: "sa-east-1",
        help: "Região onde o domínio está verificado no SES.",
      },
      {
        key: "from_email",
        label: "Remetente",
        placeholder: "contato@suaempresa.com.br",
        help: "Endereço ou domínio verificado no SES. O usuário IAM precisa da permissão ses:SendEmail.",
      },
      { key: "from_name", label: "Nome do remetente", placeholder: "Sua Empresa", optional: true },
      {
        key: "reply_to",
        label: "Responder para",
        placeholder: "comercial@suaempresa.com.br",
        optional: true,
      },
      {
        key: "webhook_token",
        label: "Token do webhook (SNS)",
        secret: true,
        optional: true,
        help: "Invente um código. No SNS, assine o tópico de eventos da SES em HTTPS: /api/public/ses?a=SUA_CONTA&t=TOKEN",
      },
    ],
  },
  {
    id: "turnstile",
    name: "Cloudflare Turnstile",
    category: "Segurança",
    description:
      "Verificação anti-robô nos formulários públicos (página do formulário e embed no site), sem quebra-cabeça para quem é gente.",
    docs: "https://developers.cloudflare.com/turnstile/get-started/",
    testable: true,
    fields: [
      {
        key: "site_key",
        label: "Site key",
        placeholder: "0x4AAAA...",
        help: "Inclua no widget do Turnstile os domínios onde o formulário aparece (o da Central de CS e o do seu site).",
      },
      { key: "secret", label: "Secret key", secret: true },
    ],
  },
  {
    id: "google_leads",
    name: "Google Ads (formulários de lead)",
    category: "Captação",
    description:
      "Leads dos formulários de anúncio do Google Ads e do YouTube entram direto na Central de CS, com campanha e GCLID.",
    docs: "https://developers.google.com/google-ads/webhook/docs/overview",
    testable: false,
    fields: [
      {
        key: "webhook_key",
        label: "Chave do webhook",
        secret: true,
        help: "Invente uma chave e cole a mesma no campo Chave do formulário no Google Ads. URL do webhook: /api/public/google-leads?account=SUA_CONTA&form=FORMULARIO_DO_NEXUS",
      },
    ],
  },
  {
    id: "flowcrm",
    name: "Flow CRM",
    category: "CRM",
    description:
      "Cada contato novo da Central de CS vira lead no Flow CRM, e cada venda ganha ou perdida vira anotação no contato de lá.",
    docs: "https://central-de-comando-time-entrega.vercel.app/solucoes",
    testable: true,
    fields: [
      {
        key: "url",
        label: "Endereço do webhook de entrada",
        placeholder: "https://xxxx.supabase.co/functions/v1/webhook-inbound",
        help: "No Flow CRM: Configurações › Integrações › Webhooks de entrada. Copie o endereço.",
      },
      {
        key: "key",
        label: "Chave do webhook (fcrm_…)",
        secret: true,
        placeholder: "fcrm_…",
        help: "Na mesma tela do Flow CRM, crie a chave e cole aqui. Fica no cofre.",
      },
    ],
  },
];

/**
 * Retirados por decisão do dono (04/11): assinatura pela ZapSign, Turnstile da Cloudflare e agenda
 * do Google/Microsoft fora da Zernio (agora em Canais › Tudo pela Zernio › Agenda e e-mail). A definição fica (dado antigo continua lendo), a tela não
 * oferece mais.
 */
export const RETIRED_PROVIDERS = new Set<ProviderId>([
  "zapsign",
  "turnstile",
  "google",
  "microsoft",
  // anúncios (Meta, Google e as outras redes) entram só pela chave única da Zernio, em Canais
  "meta_leads",
  "google_leads",
]);
export const VISIBLE_PROVIDERS = PROVIDERS.filter((p) => !RETIRED_PROVIDERS.has(p.id));

export function providerDef(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

// Nome da chave no Vault: <provider>_<campo> (escopo "integration" da conta).
export function secretKeyName(provider: ProviderId, field: string): string {
  return `${provider}_${field}`.slice(0, 40);
}
