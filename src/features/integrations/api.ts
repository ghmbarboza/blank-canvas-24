import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { callApi } from "@/lib/api";

import type { ProviderId } from "./providers";

export interface ProviderState {
  id: ProviderId;
  status: "off" | "pending" | "connected" | "error";
  last_error: string | null;
  updated_at: string | null;
  config: Record<string, string>;
  secrets: Record<string, boolean>;
}

export const integrationsKey = (accountId: string) => ["integrations", accountId];

export function useIntegrations(accountId: string) {
  return useQuery({
    queryKey: integrationsKey(accountId),
    queryFn: () =>
      callApi<{ providers: ProviderState[] }>("/api/integrations", {
        accountId,
        action: "status",
      }).then((r) => r.providers),
  });
}

export function useIntegration(accountId: string, id: ProviderId) {
  const q = useIntegrations(accountId);
  return { ...q, data: q.data?.find((p) => p.id === id) };
}

/** A integração está ligada? null enquanto carrega (não esconde nada por dúvida). */
export function useIntegrationEnabled(accountId: string, id: ProviderId): boolean | null {
  const q = useIntegrations(accountId);
  if (!q.data) return null;
  const p = q.data.find((x) => x.id === id);
  return Boolean(p && p.status !== "off");
}

export function useSaveIntegration(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: ProviderId; values: Record<string, string> }) =>
      callApi<{ ok: true }>("/api/integrations", { accountId, action: "save", ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationsKey(accountId) }),
  });
}

export function useTestIntegration(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ProviderId) =>
      callApi<{ ok: true; message: string }>("/api/integrations", {
        accountId,
        action: "test",
        provider,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: integrationsKey(accountId) }),
  });
}
