export function pct(v: number, digits = 1): string {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: 0 })}%`;
}
