// Modelos da IA embutida (Lovable AI Gateway), num lugar só. Parte pura, sem rede.
// Edição de pós-venda: todas as tarefas usam o modelo rápido do gateway (resposta em segundos).
// A conta pode trocar por tarefa em Ajustes. Antes: o forte respondia o cliente, o rápido classificava,
// o de voz fala sem silêncio na linha, e o de embedding alimenta a base de conhecimento (RAG).
// Lista conferida em GET https://ai.gateway.lovable.dev/v1/models (04/11/2026).

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

/**
 * reply: o agente respondendo o cliente em qualquer canal, campanha e e-mail gerado.
 * deep:  raciocínio longo (Cris, construtor de agente, avaliação, ata).
 * fast:  classificar, extrair, pontuar, resumir curto (muito volume, pouca latência).
 * voice: ligação ao vivo (cada segundo pensando é silêncio).
 */
export type AiTier = "reply" | "deep" | "fast" | "voice";

export const GATEWAY_MODELS: Record<AiTier, string> = {
  reply: "google/gemini-3.8-flash",
  deep: "google/gemini-3.8-flash",
  fast: "google/gemini-3.8-flash",
  voice: "google/gemini-3.8-flash",
};

/** Recuo quando o modelo escolhido pela conta falha (fora do ar, indisponível). */
export const GATEWAY_FALLBACK_MODEL = "google/gemini-3.8-flash";

/** Embedding da base de conhecimento. 1536 dimensões = a coluna vector(1536). */
export const GATEWAY_EMBEDDING_MODEL = "google/gemini-embedding-2";
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

/** Transcrição de áudio (mensagem de voz do WhatsApp, gravação). */
export const GATEWAY_TRANSCRIBE_MODEL = "openai/gpt-transcribe";

/** Modelo do gateway que fala o formato Anthropic (superfície "messages"). */
export function isGatewayClaude(model: string): boolean {
  return model.startsWith("anthropic/");
}

/** O gateway aceita a chave como Bearer; o cabeçalho próprio evita ambiguidade com x-api-key. */
export function gatewayHeaders(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}`, "lovable-api-key": key };
}

/** Endpoint do gateway para o modelo: Claude em /messages, o resto em /chat/completions. */
export function gatewayChatUrl(model: string): string {
  return `${GATEWAY_URL}/${isGatewayClaude(model) ? "messages" : "chat/completions"}`;
}

export interface GatewayModelSettings {
  /** Troca de modelo por conta (Ajustes › Inteligência), só entre os do gateway. */
  included_models?: Partial<Record<AiTier, string>>;
}

const ALLOWED = /^(anthropic|google|openai)\/[a-z0-9.-]+$/;

/** O modelo do gateway para a tarefa, respeitando a troca feita pela conta (se for válida). */
export function gatewayModel(tier: AiTier, s: GatewayModelSettings | null | undefined): string {
  const custom = s?.included_models?.[tier]?.trim();
  return custom && ALLOWED.test(custom) ? custom : GATEWAY_MODELS[tier];
}

/** Erros que valem recuar para o modelo reserva (não vale para limite e crédito: é da conta). */
export function shouldFallback(status: number): boolean {
  return status !== 402 && status !== 429 && (status >= 500 || status === 400 || status === 404);
}
