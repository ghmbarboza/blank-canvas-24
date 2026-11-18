// Saúde do negócio: regra pura sobre os sinais da sala (deal_room). Começa em 100 e cada sinal soma ou
// tira pontos; o texto de cada motivo aparece para o vendedor entender a nota.

export interface HealthSignals {
  status: string;
  lastTouchAt: string | null;
  nextActivityAt: string | null;
  overdueActivities: number;
  proposal: {
    status: string;
    sent_at: string | null;
    first_viewed_at: string | null;
    view_count: number;
  } | null;
  risks: string[];
  temperature: string | null;
  expectedCloseDate: string | null;
}

export type HealthLevel = "good" | "attention" | "risk" | "closed";

export interface HealthReason {
  tone: "up" | "down";
  text: string;
}

export interface DealHealth {
  score: number | null;
  level: HealthLevel;
  reasons: HealthReason[];
}

const DAY = 86_400_000;
const days = (from: string, now: number) => Math.floor((now - new Date(from).getTime()) / DAY);

export function dealHealth(s: HealthSignals, now: number = Date.now()): DealHealth {
  if (s.status === "won" || s.status === "lost")
    return { score: null, level: "closed", reasons: [] };
  const reasons: HealthReason[] = [];
  let score = 100;
  const add = (delta: number, text: string) => {
    score += delta;
    reasons.push({ tone: delta >= 0 ? "up" : "down", text });
  };

  if (!s.lastTouchAt) add(-25, "Nenhum contato registrado ainda");
  else {
    const d = days(s.lastTouchAt, now);
    if (d > 14) add(-30, `${d} dias sem contato`);
    else if (d > 7) add(-15, `${d} dias sem contato`);
    else add(0, d <= 0 ? "Contato hoje" : `Último contato há ${d} dia${d === 1 ? "" : "s"}`);
  }

  if (s.nextActivityAt) add(0, "Próximo passo agendado");
  else add(-20, "Sem próximo passo agendado");
  if (s.overdueActivities > 0)
    add(
      -Math.min(15, s.overdueActivities * 5),
      `${s.overdueActivities} tarefa${s.overdueActivities === 1 ? "" : "s"} atrasada${s.overdueActivities === 1 ? "" : "s"}`,
    );

  const p = s.proposal;
  if (p?.status === "accepted") add(20, "Proposta aceita");
  else if (p?.first_viewed_at || p?.status === "viewed")
    add(5, `Proposta vista${p.view_count > 1 ? ` ${p.view_count} vezes` : ""}`);
  else if (p?.status === "sent" && p.sent_at && days(p.sent_at, now) > 3)
    add(-10, "Proposta enviada e ainda não aberta");
  else if (p?.status === "declined") add(-30, "Proposta recusada");

  if (s.risks.length)
    add(-Math.min(24, s.risks.length * 8), `Riscos na última reunião: ${s.risks.length}`);

  if (s.temperature === "hot") add(10, "IA vê interesse alto");
  else if (s.temperature === "cold") add(-10, "IA vê interesse baixo");

  if (s.expectedCloseDate && new Date(`${s.expectedCloseDate}T23:59:59`).getTime() < now)
    add(-10, "Renovação ou recompra prevista já passou");

  const final = Math.max(0, Math.min(100, score));
  return {
    score: final,
    level: final >= 70 ? "good" : final >= 40 ? "attention" : "risk",
    reasons: reasons.filter((r) => r.text),
  };
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  good: "Saudável",
  attention: "Atenção",
  risk: "Em risco",
  closed: "Fechado",
};
