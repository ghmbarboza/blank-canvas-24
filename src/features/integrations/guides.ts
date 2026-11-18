// Roteiro de cada integração para quem nunca abriu o painel do fornecedor: onde criar a conta, onde
// fica a chave, o que colar de volta. Usado no assistente de configuração e em Ajustes › Integrações.
// Provedores retirados (RETIRED_PROVIDERS) não têm roteiro: a tela não oferece mais.
// Campos "auto" o Nexus gera sozinho (tokens de webhook); URLs saem prontas, com a conta e o token.
import type { ProviderId } from "./providers";

export interface ProviderGuide {
  /** Para que serve, em uma frase de quem usa (não de quem programa). */
  what: string;
  /** Quanto custa, em uma linha. */
  cost: string;
  signupUrl: string;
  /** Página onde a chave é criada (quando o fornecedor tem link direto). */
  keysUrl?: string;
  steps: string[];
  /** Campos secretos que o Nexus gera e a pessoa só copia para o painel do fornecedor. */
  autoFields?: string[];
  /** Endereços que a pessoa cola no painel do fornecedor. {base}, {account}, {form}, {campo}. */
  urls?: { label: string; template: string; help?: string }[];
}

export const GUIDES: Partial<Record<ProviderId, ProviderGuide>> = {
  openai: {
    what: "Opcional: a IA do Nexus passa a usar a sua conta da OpenAI. Sem chave, a IA inclusa continua funcionando.",
    cost: "Pago por uso na OpenAI; coloque um limite mensal em Billing › Limits.",
    signupUrl: "https://platform.openai.com/signup",
    keysUrl: "https://platform.openai.com/api-keys",
    steps: [
      "Crie a conta na OpenAI Platform e, em Billing, coloque crédito e um limite de gasto.",
      "Em API keys, clique em Create new secret key (dê um nome como Nexus) e copie a chave que começa com sk-.",
      "Cole aqui e clique em Salvar e testar: o Nexus faz uma chamada curta para conferir a chave.",
    ],
  },
  anthropic: {
    what: "Opcional: o Claude, da Anthropic, responde no lugar da IA inclusa, com a sua conta.",
    cost: "Pago por uso na Anthropic; coloque um limite mensal em Settings › Limits.",
    signupUrl: "https://console.anthropic.com",
    keysUrl: "https://console.anthropic.com/settings/keys",
    steps: [
      "Crie a conta no Console da Anthropic e, em Plans & Billing, coloque crédito.",
      "Em Settings › API Keys, clique em Create Key e copie a chave que começa com sk-ant-.",
      "Cole aqui e clique em Salvar e testar: o Nexus faz uma chamada curta para conferir a chave.",
    ],
  },
  resend: {
    what: "Envia convites, lembretes, e-mail 1 a 1 e campanhas com o nome da sua empresa.",
    cost: "Grátis até 3.000 e-mails por mês; depois, plano pago no Resend.",
    signupUrl: "https://resend.com/signup",
    keysUrl: "https://resend.com/api-keys",
    steps: [
      "Crie a conta no Resend.",
      "Em Domains, adicione o domínio da sua empresa e copie os registros DNS para quem cuida do seu site. Espere ficar Verified.",
      "Em API Keys, clique em Create API Key (permissão Sending access) e copie a chave que começa com re_.",
      "Cole a chave aqui e escolha o remetente com o domínio verificado (ex.: contato@suaempresa.com.br).",
      "Opcional: em Webhooks, cadastre o endereço abaixo (eventos delivered, bounced e complained) e cole o Signing secret no campo do webhook.",
    ],
    urls: [{ label: "Endereço do webhook", template: "{base}/api/public/resend?a={account}" }],
  },
  ses: {
    what: "Alternativa ao Resend para quem já usa a AWS. Envia pelo Amazon SES da sua conta.",
    cost: "Cerca de US$ 0,10 a cada mil e-mails, cobrado pela AWS.",
    signupUrl: "https://console.aws.amazon.com/ses/home",
    steps: [
      "No console da AWS, abra o Amazon SES e verifique o domínio da empresa em Identities.",
      "Peça a saída do modo de teste (Request production access) para poder enviar a qualquer pessoa.",
      "No IAM, crie um usuário só com a permissão ses:SendEmail e gere uma Access key.",
      "Cole a Access key ID, a Secret access key, a região e o remetente aqui.",
      "Opcional: no SNS, assine o tópico de eventos do SES em HTTPS com o endereço abaixo.",
    ],
    autoFields: ["webhook_token"],
    urls: [
      {
        label: "Endereço do webhook (SNS)",
        template: "{base}/api/public/ses?a={account}&t={webhook_token}",
      },
    ],
  },
  livekit: {
    what: "Sala de reunião própria, com transcrição ao vivo e dicas do coach durante a conversa.",
    cost: "LiveKit Cloud tem plano gratuito para começar; servidor próprio não tem custo de licença.",
    signupUrl: "https://cloud.livekit.io",
    steps: [
      "Crie a conta no LiveKit Cloud e um projeto.",
      "Em Settings › Keys, crie uma chave. Copie a URL (começa com wss://), a API key e o API secret.",
      "Cole os três aqui.",
      "Em Settings › Webhooks, cadastre o endereço abaixo, para a reunião fechar sozinha quando todos saem.",
    ],
    urls: [{ label: "Endereço do webhook", template: "{base}/api/public/livekit" }],
  },
  deepgram: {
    what: "Opcional. A IA inclusa já transcreve reuniões, ligações e áudios; o Deepgram entra quando você quer separar quem falou e ter o coach ao vivo na ligação.",
    cost: "Começa com US$ 200 de crédito grátis; depois, pago por minuto transcrito.",
    signupUrl: "https://console.deepgram.com/signup",
    keysUrl: "https://console.deepgram.com",
    steps: [
      "Crie a conta no Deepgram.",
      "No console, abra API Keys e clique em Create a New API Key (papel Member já basta).",
      "Copie a chave na hora (ela só aparece uma vez) e cole aqui.",
    ],
  },
  zadarma: {
    what: "Central telefônica: números fixos, ramais no navegador, fila, gravação e supervisão.",
    cost: "Pré-pago na Zadarma: você coloca crédito e paga por minuto e por número.",
    signupUrl: "https://zadarma.com/pt/",
    keysUrl: "https://my.zadarma.com/api/",
    steps: [
      "Crie a conta na Zadarma e coloque crédito.",
      "Em Configurações › Integrações e API, gere as chaves e copie a Key e o Secret.",
      "Cole os dois aqui. O número de saída é o que o cliente vê quando você liga.",
      "Na mesma página, em Notificações, cole o endereço abaixo em todos os eventos de chamada.",
    ],
    urls: [
      { label: "Endereço das notificações", template: "{base}/api/public/zadarma?a={account}" },
    ],
  },
  elevenlabs: {
    what: "A voz da IA ao telefone: atende, qualifica e liga para o cliente com voz natural.",
    cost: "Plano gratuito para testar; para ligações de verdade, plano pago por minuto de conversa.",
    signupUrl: "https://elevenlabs.io/app/sign-up",
    keysUrl: "https://elevenlabs.io/app/settings/api-keys",
    steps: [
      "Crie a conta na ElevenLabs.",
      "Em Developers › API Keys, crie uma chave com acesso a Agents e Text to Speech.",
      "Cole a chave aqui. Deixe o segredo do webhook em branco: o Nexus cria e guarda sozinho.",
      "Para a IA ligar: o número da Zadarma vai pela ElevenLabs no tronco SIP, sem importar. Vincule o número ao agente em Ligações › Números.",
    ],
  },
  asaas: {
    what: "Cobrança por Pix, boleto e cartão direto da proposta; o pagamento confirmado fecha o negócio.",
    cost: "Sem mensalidade; o Asaas cobra uma taxa por cobrança recebida.",
    signupUrl: "https://www.asaas.com/cadastro",
    keysUrl: "https://www.asaas.com/customerApiAccessToken/index",
    steps: [
      "Crie a conta no Asaas (para testar sem dinheiro de verdade, use sandbox.asaas.com).",
      "Em Integrações › Chave de API, gere a chave e copie na hora (ela só aparece uma vez).",
      "Cole aqui e escolha o ambiente: Sandbox para teste, Produção para valer.",
      "Em Integrações › Webhooks, crie um webhook de cobranças com o endereço abaixo e cole o token abaixo no campo Token de autenticação.",
    ],
    autoFields: ["webhook_token"],
    urls: [{ label: "Endereço do webhook", template: "{base}/api/public/asaas?a={account}" }],
  },
  flowcrm: {
    what: "Leva os leads do atendimento para o Flow CRM da Viver de IA e anota lá cada venda ganha ou perdida.",
    cost: "Sem custo extra: os dois sistemas são seus.",
    signupUrl: "https://central-de-comando-time-entrega.vercel.app/solucoes",
    steps: [
      "No Flow CRM, abra Configurações › Integrações › Webhooks de entrada.",
      "Copie o endereço do webhook de entrada e crie uma chave (começa com fcrm_).",
      "Cole os dois aqui e clique em Salvar e testar: o Flow CRM responde ao teste.",
      "Pronto: contato novo no Nexus vira lead lá, e venda ganha ou perdida vira anotação no contato.",
    ],
  },
};

/** Monta a URL do guia com a base do app, a conta e os valores conhecidos. */
export function guideUrl(
  template: string,
  ctx: { base: string; account: string; form?: string | null; values?: Record<string, string> },
): { url: string; missing: string[] } {
  const missing: string[] = [];
  const url = template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const v =
      key === "base"
        ? ctx.base.replace(/\/$/, "")
        : key === "account"
          ? ctx.account
          : key === "form"
            ? (ctx.form ?? "")
            : (ctx.values?.[key] ?? "");
    if (!v) missing.push(key);
    return v || `{${key}}`;
  });
  return { url, missing };
}

/** Token de webhook gerado no navegador (24 caracteres sem ambiguidade). */
export function newWebhookToken(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
