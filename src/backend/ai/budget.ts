// R9 · teto mensal de IA por conta. Regra pura (testável): qual é o teto e se ele já foi atingido.
// O teto fica em accounts.settings.ai_budget.monthly_usd (fora de settings.ai, que é apagado ao voltar
// para a IA inclusa). Sem valor, vale o padrão da plataforma; 0 desliga a IA da conta.
export const DEFAULT_MONTHLY_AI_BUDGET_USD = 100;
export const MAX_MONTHLY_AI_BUDGET_USD = 100_000;

export interface AiBudgetSettings {
  ai_budget?: { monthly_usd?: unknown } | null;
}

export function monthlyBudget(settings: AiBudgetSettings | null | undefined): number {
  const v = settings?.ai_budget?.monthly_usd;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MONTHLY_AI_BUDGET_USD;
  return Math.min(n, MAX_MONTHLY_AI_BUDGET_USD);
}

export function overBudget(spentUsd: number, budgetUsd: number): boolean {
  return spentUsd >= budgetUsd;
}

export function budgetMessage(budgetUsd: number): string {
  return `A IA desta conta atingiu o teto do mês (US$ ${budgetUsd.toFixed(2)}). Um administrador pode subir o teto em Ajustes › Integrações › IA.`;
}
