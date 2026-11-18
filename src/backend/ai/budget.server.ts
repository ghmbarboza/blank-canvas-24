// R9 · confere o teto mensal de IA da conta antes de cada chamada. A soma do mês vem do banco
// (ai_month_spend) e fica 60 s em memória por isolate: uma consulta por conta por minuto, não por chamada.
import { admin, allowOnce } from "@/backend/http.server";

import { budgetMessage, monthlyBudget, overBudget, type AiBudgetSettings } from "./budget";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; spent: number }>();

export class AiBudgetExceeded extends Error {
  readonly code = "ai_budget";
}

async function monthSpend(accountId: string): Promise<number> {
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.spent;
  const { data, error } = await admin().rpc("ai_month_spend", { _account: accountId });
  // sem a soma (erro do banco) não dá para provar que passou: segue, e o próximo minuto confere de novo
  const spent = error ? 0 : Number(data ?? 0);
  cache.set(accountId, { at: Date.now(), spent });
  return spent;
}

/** Lança AiBudgetExceeded se a conta já gastou o teto do mês. Avisa os gestores uma vez por mês. */
export async function assertAiBudget(accountId: string, settings: AiBudgetSettings | null) {
  const budget = monthlyBudget(settings);
  const spent = await monthSpend(accountId);
  if (!overBudget(spent, budget)) return;
  const month = new Date().toISOString().slice(0, 7);
  if (await allowOnce(`ai:budget:${accountId}:${month}`, 1, 32 * 86_400)) {
    const { notifyManagers } = await import("@/backend/agents/tools.server");
    await notifyManagers(
      accountId,
      "A IA atingiu o teto do mês",
      `Gasto de US$ ${spent.toFixed(2)} com teto de US$ ${budget.toFixed(2)}. A IA parou; o resto da central segue.`,
      "/ajustes?aba=integracoes",
    ).catch(() => {});
  }
  throw new AiBudgetExceeded(budgetMessage(budget));
}

/** Para testes e para a tela de ajustes: esquece a soma guardada desta conta. */
export function forgetAiSpend(accountId: string) {
  cache.delete(accountId);
}
