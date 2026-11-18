// Contas da visão geral da Qualidade: faixas de nota, média do período anterior e a prova
// (trecho citado) de cada critério que mais derruba a nota. Puro, testado em overview.test.ts.

import type { EvaluationItem } from "./scoring";

export interface ScoreBucket {
  key: "top" | "good" | "mid" | "low";
  label: string;
  count: number;
  pct: number;
}

const BUCKETS: { key: ScoreBucket["key"]; label: string; min: number }[] = [
  { key: "top", label: "90 a 100", min: 90 },
  { key: "good", label: "70 a 89", min: 70 },
  { key: "mid", label: "50 a 69", min: 50 },
  { key: "low", label: "Abaixo de 50", min: -Infinity },
];

/** Distribui as notas nas quatro faixas. Eliminada conta como abaixo de 50. */
export function scoreBuckets(rows: { score: number | null; eliminated: boolean }[]): ScoreBucket[] {
  const counts = new Map<ScoreBucket["key"], number>(BUCKETS.map((b) => [b.key, 0]));
  let total = 0;
  for (const r of rows) {
    if (r.score === null && !r.eliminated) continue;
    const s = r.eliminated ? 0 : Number(r.score);
    const bucket = BUCKETS.find((b) => s >= b.min) ?? BUCKETS[BUCKETS.length - 1]!;
    counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
    total += 1;
  }
  return BUCKETS.map((b) => {
    const count = counts.get(b.key) ?? 0;
    return {
      key: b.key,
      label: b.label,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
    };
  });
}

/** Frase curta que resume a distribuição, com número. */
export function bucketsSentence(buckets: ScoreBucket[]): string {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) return "Sem notas no período.";
  const top = [...buckets].sort((a, b) => b.count - a.count)[0]!;
  const low = buckets.find((b) => b.key === "low");
  const lead = `A maior parte está na faixa de ${top.label.toLowerCase()} (${top.pct}%).`;
  if (low && low.count > 0 && top.key !== "low")
    return `${lead} ${low.count} ${low.count === 1 ? "interação ficou" : "interações ficaram"} abaixo de 50.`;
  return lead;
}

/**
 * Média do período anterior, tirada de duas leituras da mesma RPC: a do período (n, média)
 * e a do dobro do período. Devolve null quando não há base anterior.
 */
export function previousAverage(
  current: { evaluated: number; avg_score: number | null },
  doubled: { evaluated: number; avg_score: number | null },
): number | null {
  if (current.avg_score === null || doubled.avg_score === null) return null;
  const prevN = doubled.evaluated - current.evaluated;
  if (prevN <= 0) return null;
  const prev =
    (doubled.avg_score * doubled.evaluated - current.avg_score * current.evaluated) / prevN;
  return Number.isFinite(prev) ? prev : null;
}

export interface Evidence {
  evaluationId: string;
  channel: string;
  createdAt: string;
  quote: string;
  comment: string;
}

/**
 * Para cada critério, o trecho mais recente em que ele foi reprovado. Prefere o trecho
 * conferido na transcrição; as avaliações chegam da mais nova para a mais antiga.
 */
export function evidenceByCriterion(
  evaluations: { id: string; channel: string; created_at: string; items: EvaluationItem[] }[],
  criterionIds: string[],
): Map<string, Evidence> {
  const wanted = new Set(criterionIds);
  const verified = new Map<string, Evidence>();
  const loose = new Map<string, Evidence>();
  for (const e of evaluations) {
    for (const it of Array.isArray(e.items) ? e.items : []) {
      if (!wanted.has(it.criterion_id) || it.passed) continue;
      const quote = (it.evidence ?? "").trim();
      if (!quote) continue;
      const ev: Evidence = {
        evaluationId: e.id,
        channel: e.channel,
        createdAt: e.created_at,
        quote,
        comment: (it.comment ?? "").trim(),
      };
      const target = it.evidence_verified ? verified : loose;
      if (!target.has(it.criterion_id)) target.set(it.criterion_id, ev);
    }
  }
  const out = new Map<string, Evidence>();
  for (const id of criterionIds) {
    const ev = verified.get(id) ?? loose.get(id);
    if (ev) out.set(id, ev);
  }
  return out;
}

/** Leitura da concordância entre a IA e o gestor, em palavras. */
export function agreementLabel(pct: number | null): string | null {
  if (pct === null) return null;
  if (pct >= 85) return "Alinhada";
  if (pct >= 70) return "Pede atenção";
  return "Desalinhada";
}
