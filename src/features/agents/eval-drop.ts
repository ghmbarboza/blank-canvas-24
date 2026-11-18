import type { EvalTrend } from "./api";

const pct = (n: number) => Math.round(n * 100);

/** Queda real: a última avaliação ficou abaixo da anterior e abaixo dos 90% exigidos. */
export function evalDrop(trend: EvalTrend | undefined): { from: number; to: number } | null {
  if (!trend || trend.previous === null) return null;
  if (trend.latest >= trend.previous || trend.latest >= 0.9) return null;
  return { from: pct(trend.previous), to: pct(trend.latest) };
}
