import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { ACCOUNT_QUERY_KEY } from "@/lib/account";
import { callFunction } from "@/lib/functions";
import { patchAccountSettings } from "@/features/settings/api";

export type Channel = Pick<
  Tables<"channels">,
  | "id"
  | "provider"
  | "platform"
  | "name"
  | "handle"
  | "status"
  | "status_detail"
  | "owner_user_id"
  | "is_shared"
  | "ai_enabled"
  | "last_event_at"
  | "created_at"
>;

export type IntegrationProvider = "evolution" | "zernio" | "openai" | "anthropic";

export interface Integration {
  provider: string;
  status: string;
  lastError: string | null;
  baseUrl: string | null;
}

export interface IntegrationsState {
  byProvider: Record<string, Integration>;
  // Nomes das chaves que existem no cofre (nunca o valor), p.ex. "zernio_api_key".
  secretKeys: string[];
}

export function channelsKey(accountId: string) {
  return ["channels", accountId] as const;
}

export function useChannels(accountId: string) {
  return useQuery({
    queryKey: channelsKey(accountId),
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select(
          "id, provider, platform, name, handle, status, status_detail, owner_user_id, is_shared, ai_enabled, last_event_at, created_at",
        )
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------- integrações (só admin)

// Chave própria: a tela de Integrações usa ["integrations", conta] com outro formato de dado.
// Mesmo prefixo, então salvar uma integração invalida as duas.
function integrationsKey(accountId: string) {
  return ["integrations", accountId, "state"] as const;
}

export function useIntegrations(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: integrationsKey(accountId),
    enabled,
    queryFn: async (): Promise<IntegrationsState> => {
      const [{ data, error }, keysRes] = await Promise.all([
        supabase
          .from("account_integrations")
          .select("provider, status, last_error, config")
          .eq("account_id", accountId),
        supabase.rpc("secret_keys", {
          _account: accountId,
          _scope: "integration",
          _scope_id: accountId,
        }),
      ]);
      if (error) throw error;
      if (keysRes.error) throw keysRes.error;
      const byProvider: Record<string, Integration> = {};
      for (const row of data ?? []) {
        const cfg =
          row.config && typeof row.config === "object" && !Array.isArray(row.config)
            ? row.config
            : {};
        const baseUrl = cfg["base_url"];
        byProvider[row.provider] = {
          provider: row.provider,
          status: row.status,
          lastError: row.last_error,
          baseUrl: typeof baseUrl === "string" ? baseUrl : null,
        };
      }
      return { byProvider, secretKeys: keysRes.data ?? [] };
    },
  });
}

export function hasSecret(state: IntegrationsState | undefined, provider: string): boolean {
  return state?.secretKeys.includes(`${provider}_api_key`) ?? false;
}

export function isConnected(state: IntegrationsState | undefined, provider: string): boolean {
  return state?.byProvider[provider]?.status === "connected";
}

interface SaveResult {
  ok: boolean;
  status: string;
  error: string | null;
}

export function useSaveIntegration(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      provider: IntegrationProvider;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    }) => callFunction<SaveResult>("channels", { accountId, action: "integration.save", ...input }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: integrationsKey(accountId) });
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
    },
  });
}

// Volta para a IA inclusa: remove settings.ai (as chaves próprias continuam no cofre).
export function useUseBundledAi(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      patchAccountSettings(accountId, (cur) => {
        const { ai: _drop, ...rest } = cur;
        return rest;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  });
}

// ---------------------------------------------------------------- ações de canal

export interface QrPayload {
  qr: string | null;
  pairingCode: string | null;
}

export interface CreateEvolutionResult extends QrPayload {
  channelId: string;
}

export interface MetaConnectResult {
  channelId: string;
  webhookUrl: string;
  verifyToken: string;
}

export interface WebhookInfo {
  webhookUrl: string;
  verifyToken?: string;
}

export function channelAction<T>(
  accountId: string,
  action: string,
  params: Record<string, unknown> = {},
) {
  return callFunction<T>("channels", { accountId, action, ...params });
}

// Mutação genérica para as ações da edge function; recarrega a lista no fim.
export function useChannelAction<TInput extends Record<string, unknown>, TResult>(
  accountId: string,
  action: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => channelAction<TResult>(accountId, action, input),
    onSettled: () => qc.invalidateQueries({ queryKey: channelsKey(accountId) }),
  });
}

export function useUpdateChannel(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      ownerUserId?: string | null;
      isShared?: boolean;
      aiEnabled?: boolean;
    }) => {
      const patch: {
        name?: string;
        owner_user_id?: string | null;
        is_shared?: boolean;
        ai_enabled?: boolean;
      } = {};
      if (input.aiEnabled !== undefined) patch.ai_enabled = input.aiEnabled;
      if (input.name !== undefined) patch.name = input.name;
      if (input.ownerUserId !== undefined) patch.owner_user_id = input.ownerUserId;
      if (input.isShared !== undefined) patch.is_shared = input.isShared;
      const { error } = await supabase
        .from("channels")
        .update(patch)
        .eq("account_id", accountId)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: channelsKey(accountId) }),
  });
}

// Evolution apaga a instância no servidor; os outros provedores só saem da conta.
export function useRemoveChannel(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channel: Pick<Channel, "id" | "provider">) => {
      if (channel.provider === "evolution") {
        await channelAction(accountId, "evolution.delete", { channelId: channel.id });
        return;
      }
      const { error } = await supabase
        .from("channels")
        .delete()
        .eq("account_id", accountId)
        .eq("id", channel.id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: channelsKey(accountId) }),
  });
}
