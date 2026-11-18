// Leituras prontas para a tela de Pontuação e rodízio, puras para testar sem banco.

import { featureLabel } from "./model";
import type { RoutingMatch } from "./routing";

export interface ModelFactor {
  key: string;
  label: string;
  /** Parte do peso total do modelo, de 0 a 100. */
  share: number;
  direction: "up" | "down";
}

/** Os fatores de maior peso no modelo treinado (pesos guardados em lead_score_models.weights). */
export function topModelFactors(weightsJson: unknown, n = 3): ModelFactor[] {
  const model = weightsJson as {
    weights?: Record<string, unknown>;
    labels?: Record<string, unknown>;
  };
  const entries = Object.entries(model?.weights ?? {}).filter(
    (e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] !== 0,
  );
  const total = entries.reduce((s, [, w]) => s + Math.abs(w), 0);
  if (!total) return [];
  return entries
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n)
    .map(([key, w]) => {
      const label = model.labels?.[key];
      return {
        key,
        label: typeof label === "string" && label ? label : featureLabel(key),
        share: Math.round((Math.abs(w) / total) * 100),
        direction: w > 0 ? "up" : "down",
      };
    });
}

export const HEAT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
/** Segunda a domingo, na ordem do calendário comercial. */
export const HEAT_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export interface HeatMap {
  /** cells[dia][hora] = quantos leads respondem melhor nesse dia e hora. */
  cells: number[][];
  max: number;
  total: number;
  peak: { dow: number; hour: number } | null;
}

/** Mapa de calor do melhor horário de resposta, a partir do horário ideal de cada lead. */
export function bestHourHeat(
  leads: { best_hour: number | null; best_dow: number | null }[],
): HeatMap {
  const cells = HEAT_DAYS.map(() => HEAT_HOURS.map(() => 0));
  let total = 0;
  for (const l of leads) {
    if (l.best_hour === null || l.best_dow === null) continue;
    const d = HEAT_DAYS.indexOf(l.best_dow as (typeof HEAT_DAYS)[number]);
    const h = HEAT_HOURS.indexOf(l.best_hour as (typeof HEAT_HOURS)[number]);
    if (d < 0 || h < 0) continue;
    const row = cells[d]!;
    row[h] = (row[h] ?? 0) + 1;
    total += 1;
  }
  let max = 0;
  let peak: HeatMap["peak"] = null;
  cells.forEach((row, d) =>
    row.forEach((n, h) => {
      if (n > max) {
        max = n;
        peak = { dow: HEAT_DAYS[d]!, hour: HEAT_HOURS[h]! };
      }
    }),
  );
  return { cells, max, total, peak };
}

function orList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} ou ${values[values.length - 1]}`;
}

/** A condição da regra em português de gente: "Se o estado for SP ou RJ e o segmento for varejo". */
export function ruleCondition(match: RoutingMatch): string | null {
  const parts: string[] = [];
  if (match.states?.length) parts.push(`o estado for ${orList(match.states)}`);
  if (match.cities?.length) parts.push(`a cidade for ${orList(match.cities)}`);
  if (match.segments?.length) parts.push(`o segmento for ${orList(match.segments)}`);
  if (match.sources?.length) parts.push(`a origem for ${orList(match.sources)}`);
  if (match.sizes?.length) parts.push(`o porte for ${orList(match.sizes)}`);
  if (!parts.length) return null;
  return `Se ${parts.join(" e ")}`;
}

/** Quem recebe o próximo lead no rodízio, pelo mesmo cursor que o roteador usa. */
export function nextInRotation(rule: {
  mode: string;
  user_ids: string[];
  rr_cursor: number;
}): string | null {
  const n = rule.user_ids.length;
  if (!n) return null;
  if (rule.mode === "user") return rule.user_ids[0] ?? null;
  return rule.user_ids[((rule.rr_cursor % n) + n) % n] ?? null;
}
