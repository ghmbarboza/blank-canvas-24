// Contas da entrada do Treino: média do vendedor no mês contra o mês anterior e a média por
// persona (para marcar onde ele mais precisa praticar). Puro, testado em lobby.test.ts.

const DAY = 86_400_000;

export interface SessionLike {
  user_id: string;
  persona_id: string | null;
  status: string;
  score: number | null;
  created_at: string;
}

function average(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
}

/** Média das notas encerradas do vendedor nos últimos `days` dias e nos `days` anteriores. */
export function myTrainingStats(
  sessions: SessionLike[],
  userId: string | undefined,
  days = 30,
  now = Date.now(),
): { avg: number | null; previous: number | null; count: number } {
  const cur: number[] = [];
  const prev: number[] = [];
  for (const s of sessions) {
    if (s.user_id !== userId || s.status !== "finished" || s.score === null) continue;
    const age = now - new Date(s.created_at).getTime();
    if (age <= days * DAY) cur.push(s.score);
    else if (age <= 2 * days * DAY) prev.push(s.score);
  }
  return { avg: average(cur), previous: average(prev), count: cur.length };
}

/** Média e quantidade de treinos encerrados do vendedor por persona. */
export function scoreByPersona(
  sessions: SessionLike[],
  userId: string | undefined,
): Map<string, { avg: number; n: number }> {
  const acc = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.user_id !== userId || s.status !== "finished" || s.score === null || !s.persona_id)
      continue;
    acc.set(s.persona_id, [...(acc.get(s.persona_id) ?? []), s.score]);
  }
  return new Map([...acc].map(([id, xs]) => [id, { avg: average(xs)!, n: xs.length }]));
}

/** Nota abaixo disso marca a persona como ponto de melhoria. */
export const WEAK_MARK = 70;
