/**
 * Conversão entre etapas vizinhas pelo que CHEGOU em cada etapa (ela ou qualquer uma depois),
 * não pelo que está parado nela: parado dá mais de 100% quando a etapa seguinte acumula mais.
 * Recebe as etapas em ordem, sem a de perdidos. null quando a etapa não teve ninguém.
 */
export function stageConversions(counts: number[]): (number | null)[] {
  const reached = counts.map((_, i) => counts.slice(i).reduce((a, b) => a + b, 0));
  return counts.map((_, i) => {
    if (i === counts.length - 1 || reached[i]! === 0) return null;
    return Math.round((100 * reached[i + 1]!) / reached[i]!);
  });
}
