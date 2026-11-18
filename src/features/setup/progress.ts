// O roteiro da Nexa é a única fonte do onboarding: o indicador fixo do layout, o cartão do
// Painel, a aba Progresso e a abertura automática leem daqui (o servidor calcula pelo estado
// real da conta). A Nexa invalida ["setup"] a cada rodada, então isto se atualiza sozinho.
import { useQuery } from "@tanstack/react-query";

import { callApi } from "@/lib/api";

export interface RoteiroStepView {
  id: string;
  title: string;
  required: boolean;
  done: boolean;
  skipped: boolean;
}

export interface RoteiroView {
  steps: RoteiroStepView[];
  current: string | null;
  requiredPending: number;
  remaining: number;
}

export const roteiroKey = (accountId: string) => ["setup", "roteiro", accountId] as const;

export function useRoteiro(accountId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: roteiroKey(accountId ?? ""),
    enabled: Boolean(accountId) && enabled,
    staleTime: 30_000,
    queryFn: () =>
      callApi<RoteiroView>("/api/setup-chat", { accountId: accountId!, action: "progress" }),
  });
}
