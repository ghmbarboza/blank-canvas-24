// Ponto só de milhar, sem vírgula: "1.200", "12.345.678" (é como moneyInputValue mostra).
const THOUSANDS_ONLY = /^\d{1,3}(\.\d{3})+$/;

// "1.500,50" → 1500.5 · "1.200" → 1200 · "1500.50" → 1500.5 · "" → 0. Null se não for número.
export function parseMoneyInput(raw: string): number | null {
  const clean = raw.replace(/[^\d.,-]/g, "");
  if (!clean) return 0;
  const normalized =
    clean.includes(",") || THOUSANDS_ONLY.test(clean)
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function moneyInputValue(n: number | null | undefined): string {
  if (!n) return "";
  // com centavos, sempre duas casas ("1.890,50", nunca "1.890,5")
  const cents = !Number.isInteger(n);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}
