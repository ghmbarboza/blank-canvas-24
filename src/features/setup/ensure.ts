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
    callApi<EnsureResult>("/api/platform", { accountId })
      .then(() => {
        if (!alive) return;
        try {
          sessionStorage.setItem(FLAG, accountId);
        } catch {
          /* ignora */
        }
      })
      .catch((e: unknown) => {
        // não trava o app, mas não cala: sem isso as rotinas automáticas ficam paradas
        toast.error(
          `Não deu para preparar as rotinas automáticas (${errorMessage(e)}). Recarregue a página; se continuar, veja Ajustes › Integrações.`,
          { id: "platform-ensure" },
        );
      });
    return () => {
      alive = false;
    };
  }, [accountId, isAdmin]);
}
