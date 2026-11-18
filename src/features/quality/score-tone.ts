/** Faixa da nota pela rampa de navy do DS; coral só para eliminada (falha grave). */
export function scoreTone(score: number | null, eliminated = false): string {
  if (eliminated) return "bg-danger/10 text-danger ring-1 ring-danger/30";
  if (score === null) return "bg-surface-2 text-muted-foreground";
  if (score >= 85) return "bg-primary text-primary-foreground";
  if (score >= 70) return "bg-warm-soft text-warm-fg ring-1 ring-warm-line";
  return "bg-cold-soft text-cold-fg ring-1 ring-cold-line";
}
