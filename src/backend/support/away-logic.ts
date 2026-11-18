// Resposta automática fora do horário (#65). Puro: o job lê o estado e isto decide se manda.
import { withinBusinessHours } from "./agent-logic";

export interface AwaySettings {
  enabled?: boolean;
  text?: string;
}

export const AWAY_COOLDOWN_MS = 12 * 3600_000;
export const AWAY_DEFAULT_TEXT =
  "Oi! Recebemos sua mensagem. Estamos fora do horário de atendimento agora e respondemos assim que voltarmos.";

export function awayDecision(p: {
  now: Date;
  tz: string;
  businessHours: Parameters<typeof withinBusinessHours>[2];
  away: AwaySettings | null | undefined;
  /** alguém (pessoa ou IA) já respondeu depois da última mensagem do cliente */
  answered: boolean;
  /** quando foi o último aviso de fora do horário nesta conversa */
  lastAwayAt: Date | null;
}): { send: false; reason: string } | { send: true; text: string } {
  if (!p.away?.enabled) return { send: false, reason: "resposta fora do horário desligada" };
  if (!p.businessHours || withinBusinessHours(p.now, p.tz, p.businessHours))
    return { send: false, reason: "dentro do horário" };
  if (p.answered) return { send: false, reason: "já respondida" };
  if (p.lastAwayAt && p.now.getTime() - p.lastAwayAt.getTime() < AWAY_COOLDOWN_MS)
    return { send: false, reason: "aviso já enviado há menos de 12 h" };
  const text = (p.away.text ?? "").trim() || AWAY_DEFAULT_TEXT;
  return { send: true, text: text.slice(0, 1000) };
}
