// Forecast pela conversa: lê o que a ata da reunião já extraiu (riscos, objeções, decisões, próximos
// passos e nota) e sugere mover a categoria do forecast do negócio. Nunca aplica sozinho: o vendedor
// decide com "Aplicar" ou "Ignorar". Regra pura, usada pelo job meeting.minutes.

export const FORECAST_CATEGORIES = ["commit", "best_case", "pipeline", "omitted"] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];

export const FORECAST_LABEL: Record<ForecastCategory, string> = {
  commit: "Compromisso",
  best_case: "Melhor cenário",
  pipeline: "Pipeline",
  omitted: "Fora do forecast",
};

export interface MinutesSignals {
  risks: string[];
  objections: { objection: string; handled: boolean }[];
  decisions: string[];
  next_steps: { title: string; owner: string; due_in_days?: number }[];
  /** Nota da reunião, 0 a 100. */
  score: number | null;
}

export interface ForecastSuggestion {
  suggested: ForecastCategory;
  reasons: string[];
}

const RISKS_TO_DOWNGRADE = 3;
const UNHANDLED_TO_DOWNGRADE = 2;
const SCORE_TO_UPGRADE = 70;
const COMMIT_WINDOW_DAYS = 45;

export function currentCategory(custom: unknown): ForecastCategory {
  const v =
    custom && typeof custom === "object"
      ? (custom as Record<string, unknown>)["forecast_category"]
      : null;
  return (FORECAST_CATEGORIES as readonly string[]).includes(v as string)
    ? (v as ForecastCategory)
    : "pipeline";
}

const DOWN: Partial<Record<ForecastCategory, ForecastCategory>> = {
  commit: "best_case",
  best_case: "pipeline",
};
const UP: Partial<Record<ForecastCategory, ForecastCategory>> = {
  pipeline: "best_case",
  best_case: "commit",
};

export function suggestForecast(
  current: ForecastCategory,
  m: MinutesSignals,
  expectedCloseDate: string | null,
  now: number = Date.now(),
): ForecastSuggestion | null {
  // "Fora do forecast" foi escolha consciente do vendedor: a ata não mexe.
  if (current === "omitted") return null;
  const risks = m.risks.filter((r) => r.trim());
  const unhandled = m.objections.filter((o) => !o.handled);

  const down: string[] = [];
  if (risks.length >= RISKS_TO_DOWNGRADE) down.push(`${risks.length} riscos apontados na reunião`);
  if (unhandled.length >= UNHANDLED_TO_DOWNGRADE)
    down.push(`${unhandled.length} objeções sem resposta`);
  if (m.score !== null && m.score < 40) down.push(`Nota da reunião baixa (${m.score}/100)`);
  if (down.length) {
    const target = DOWN[current];
    return target ? { suggested: target, reasons: [...down, ...risks.slice(0, 3)] } : null;
  }

  const clientStep = m.next_steps.some((n) => n.owner === "cliente");
  const strong =
    risks.length === 0 &&
    unhandled.length === 0 &&
    m.decisions.length > 0 &&
    clientStep &&
    (m.score ?? 0) >= SCORE_TO_UPGRADE;
  if (!strong) return null;
  const target = UP[current];
  if (!target) return null;
  if (target === "commit") {
    const close = expectedCloseDate ? new Date(`${expectedCloseDate}T12:00:00`).getTime() : null;
    if (close === null || close < now || close - now > COMMIT_WINDOW_DAYS * 86_400_000) return null;
  }
  return {
    suggested: target,
    reasons: [
      `Decisões tomadas: ${m.decisions.slice(0, 2).join("; ")}`,
      "O cliente assumiu um próximo passo",
      `Nota da reunião ${m.score}/100, sem riscos nem objeções abertas`,
    ],
  };
}
