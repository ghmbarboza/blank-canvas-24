// Erro da IA em português de operador: o que aconteceu e o que fazer. Nunca "Erro interno".
export interface FriendlyError {
  status: number;
  code: string;
  message: string;
}

export function friendlyAiError(err: unknown): FriendlyError | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = /^IA (\d{3}):?\s*(.*)$/s.exec(raw);
  if (/Nenhum provedor de IA configurado/i.test(raw))
    return {
      status: 409,
      code: "ai_not_configured",
      message:
        "A IA ainda não está ligada nesta conta. Escolha a IA inclusa no assistente ou cadastre sua chave em Ajustes › Integrações.",
    };
  if (/limite de uso da IA/i.test(raw))
    return {
      status: 429,
      code: "ai_rate_limited",
      message: "A IA está com muitos pedidos agora. Tente de novo em um minuto.",
    };
  if (/créditos de IA esgotados/i.test(raw))
    return {
      status: 402,
      code: "ai_no_credit",
      message:
        "Os créditos da IA acabaram. Recarregue a conta do provedor ou cadastre sua própria chave em Ajustes › Integrações.",
    };
  if (/aborted|timeout|timed out/i.test(raw))
    return {
      status: 504,
      code: "ai_timeout",
      message: "A IA demorou demais para responder. Tente de novo.",
    };
  if (!m) return null;
  const status = Number(m[1]);
  const detail = (m[2] ?? "").toLowerCase();
  if (status === 401 || status === 403 || /api key|invalid x-api-key|authentication/.test(detail))
    return {
      status: 400,
      code: "ai_bad_key",
      message:
        "A chave de IA cadastrada foi recusada pelo provedor. Confira a chave em Ajustes › Integrações ou volte para a IA inclusa.",
    };
  if (/tool|function/.test(detail))
    return {
      status: 502,
      code: "ai_no_tools",
      message:
        "A IA inclusa não aceitou usar as ferramentas de consulta. Cadastre uma chave própria (OpenAI ou Anthropic) em Ajustes › Integrações para usar este recurso.",
    };
  return {
    status: 502,
    code: "ai_failed",
    message: `A IA não conseguiu responder agora (código ${status}). Tente de novo em instantes.`,
  };
}
