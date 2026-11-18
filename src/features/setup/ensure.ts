import { useEffect } from "react";

import { toast } from "sonner";

import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";

export interface EnsureResult {
  created: string[];
  jobs_created: number;
  app_base_url: string | null;
  origin_mismatch: boolean;
  origin_accepted: boolean;
  vapid_created: boolean;
}

const FLAG = "nexus:platform-ensured";
const RETRY_DELAYS_MS = [3_000, 8_000];

type EnsureOutcome = { ok: true } | { ok: false; error: unknown };

export const NOT_PUBLISHED_MESSAGE =
  "Este app ainda não está publicado. Na prévia a IA não responde e as automações não rodam: clique em Publicar no Lovable e use o endereço publicado.";

/** Sem endereço gravado o agendador não tem para onde chamar: mensagem chega e ninguém responde.
 *  Acontece com quem testa pela prévia do Lovable antes de publicar (visto em 18/11). */
export function needsPublish(result: Pick<EnsureResult, "app_base_url"> | null | undefined): boolean {
  return !result || !result.app_base_url;
}

/** Na cópia recém-criada a primeira chamada às vezes falha e a seguinte passa (visto em 18/11):
 *  tenta de novo sozinho antes de mostrar erro para a pessoa. */
export async function ensureWithRetry(
  call: () => Promise<unknown>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<EnsureOutcome> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await call();
      return { ok: true };
    } catch (error) {
      lastError = error;
      const delay = delays[attempt];
      if (delay !== undefined) await wait(delay);
    }
  }
  return { ok: false, error: lastError };
}

// Remix pronto sozinho (#20): no primeiro acesso de um dono/admin em cada aba, a plataforma
// cria o que falta (segredos, tarefas agendadas, endereço, chaves de push). Idempotente.
export function useEnsurePlatform(accountId: string | null, isAdmin: boolean): void {
  useEffect(() => {
    if (!accountId || !isAdmin) return;
    try {
      if (sessionStorage.getItem(FLAG) === accountId) return;
    } catch {
      /* sem sessionStorage: segue e chama assim mesmo */
    }
    let alive = true;
    let result: EnsureResult | null = null;
    void ensureWithRetry(async () => {
      result = await callApi<EnsureResult>("/api/platform", { accountId });
    }).then(
      (outcome) => {
        if (!alive) return;
        if (outcome.ok) {
          if (needsPublish(result)) {
            // não grava a marca: confere de novo na próxima carga, até o app estar publicado
            toast.warning(NOT_PUBLISHED_MESSAGE, { id: "platform-publish", duration: Infinity });
            return;
          }
          try {
            sessionStorage.setItem(FLAG, accountId);
          } catch {
            /* ignora */
          }
          return;
        }
        // não trava o app, mas não cala: sem isso as rotinas automáticas ficam paradas
        toast.error(
          `Não deu para preparar as rotinas automáticas (${errorMessage(outcome.error)}). Recarregue a página e tente de novo.`,
          { id: "platform-ensure" },
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [accountId, isAdmin]);
}
