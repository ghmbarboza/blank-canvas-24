// O roteiro é a única fonte do onboarding: o passo a passo, o indicador fixo do layout, o cartão
// do Painel e a abertura automática leem daqui (o servidor calcula pelo estado real da conta).
// Cada formulário e cada rodada da Cris invalidam ["setup"], então isto se atualiza sozinho.
import { useQuery } from "@tanstack/react-query";

import { callApi } from "@/lib/api";

export interface RoteiroStepView {
  id: string;
  title: string;
  /** uma frase para o dono */
  summary?: string;
  required: boolean;
  /** "Depois, se quiser": fora da barra de progresso */
  later?: boolean;
  done: boolean;
  skipped: boolean;
}

export interface RoteiroDetail {
  company: string;
  segment: string | null;
  sells: string;
  tone: string;
  whatsapp: string | null;
  documents: number;
  rulesOn: number;
  received: boolean;
  replied: boolean;
}

export interface RoteiroView {
  steps: RoteiroStepView[];
  current: string | null;
  requiredPending: number;
  remaining: number;
  mainTotal?: number;
  mainDone?: number;
  detail?: RoteiroDetail;
}

export type StepStatus = "feito" | "agora" | "depois";

/** Passos da barra de progresso (os seis), na ordem. */
export function mainSteps(r: RoteiroView): RoteiroStepView[] {
  return r.steps.filter((s) => !s.later);
}

export function laterSteps(r: RoteiroView): RoteiroStepView[] {
  return r.steps.filter((s) => s.later);
}

/** O próximo clique: o passo atual do servidor ou, na falta, o primeiro que não está feito. */
export function nextStepId(r: RoteiroView): string | null {
  const main = mainSteps(r);
  if (r.current && main.some((s) => s.id === r.current && !s.done)) return r.current;
  return main.find((s) => !s.done)?.id ?? null;
}

export function stepStatus(r: RoteiroView, id: string): StepStatus {
  const step = r.steps.find((s) => s.id === id);
  if (step?.done) return "feito";
  return nextStepId(r) === id ? "agora" : "depois";
}

export function progressOf(r: RoteiroView): { done: number; total: number; pct: number } {
  const main = mainSteps(r);
  const done = main.filter((s) => s.done).length;
  const total = main.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 100 };
}

export const roteiroKey = (accountId: string) => ["setup", "roteiro", accountId] as const;

export function useRoteiro(accountId: string | null, enabled: boolean, live = false) {
  return useQuery({
    queryKey: roteiroKey(accountId ?? ""),
    enabled: Boolean(accountId) && enabled,
    staleTime: live ? 0 : 30_000,
    // com o passo a passo aberto, confere de tempos em tempos (mensagem de teste, avaliação)
    refetchInterval: live ? 5000 : false,
    queryFn: () =>
      callApi<RoteiroView>("/api/setup-chat", { accountId: accountId!, action: "progress" }),
  });
}
