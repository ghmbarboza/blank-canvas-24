import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Json } from "@/integrations/supabase/types";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { patchAccountSettings } from "@/features/settings/api";
import type { SetupSettings } from "./types";

// Estado do assistente fica em accounts.settings.setup (mesclado, nunca sobrescreve outras chaves).
export function useSetupSettings(): SetupSettings {
  const { current } = useAccount();
  const raw = (current?.settings as { setup?: SetupSettings } | undefined)?.setup;
  return raw ?? {};
}

export function usePatchSetup(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SetupSettings>) =>
      patchAccountSettings(accountId, (cur) => {
        const prev = (cur["setup"] ?? {}) as Record<string, Json | undefined>;
        return { ...cur, setup: { ...prev, ...(patch as Record<string, Json | undefined>) } };
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  });
}

export interface PlatformStatus {
  app_base_url: string | null;
  cron_secret: boolean;
  agent_secret: boolean;
  email_link_secret: boolean;
  meta_verify_token: boolean;
  vapid: boolean;
  /** Para onde vai o e-mail de serviço fora do ar; null = só no painel de Saúde. */
  alert_email?: string | null;
  jobs: string[];
  jobs_expected: number;
  last_tick: string | null;
}

export const platformKey = (accountId: string) => ["platform", accountId] as const;

export function usePlatformStatus(accountId: string, enabled = true) {
  return useQuery({
    queryKey: platformKey(accountId),
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PlatformStatus> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? "";
      const res = await fetch(`/api/platform?accountId=${accountId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as
        (PlatformStatus & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? `Falha (${res.status})`);
      return body;
    },
  });
}

export function useEnsurePlatformNow(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) =>
      callApi<{ origin_mismatch: boolean; app_base_url: string | null; origin_accepted: boolean }>(
        "/api/platform",
        { accountId, force },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKey(accountId) }),
  });
}

/** Instalação pronta: endereço gravado, segredos, as 5 tarefas e um sinal de vida nos últimos 5 min. */
export function installReady(s: PlatformStatus | undefined, now = Date.now()): boolean {
  if (!s) return false;
  const ticking = s.last_tick ? now - new Date(s.last_tick).getTime() < 5 * 60_000 : false;
  return (
    Boolean(s.app_base_url) &&
    s.cron_secret &&
    s.agent_secret &&
    s.email_link_secret &&
    s.jobs.length >= s.jobs_expected &&
    ticking
  );
}
