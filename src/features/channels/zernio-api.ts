// Hooks da frente Zernio (WhatsApp, número real e voz). Tudo passa pela rota /api/zernio;
// leituras de tabela (números, permissões) vêm direto do banco, filtradas pela conta.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import { channelsKey } from "./api";
import type {
  ForwardChoice,
  HealthVerdict,
  HoursChoice,
  NumberHealthRow,
  NumberOffer,
} from "./zernio-rules";

export type ZernioNumber = Tables<"zernio_numbers">;

export function zernio<T>(
  accountId: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return callApi<T>("/api/zernio", { accountId, action, ...params });
}

export const zernioKeys = {
  numbers: (accountId: string) => ["zernio-numbers", accountId] as const,
  catalog: (accountId: string) => ["zernio-catalog", accountId] as const,
  health: (accountId: string) => ["zernio-health", accountId] as const,
  calling: (accountId: string, channelId: string) =>
    ["zernio-calling", accountId, channelId] as const,
  permission: (accountId: string, contactId: string) =>
    ["zernio-permission", accountId, contactId] as const,
};

export interface KeyResult {
  ok: boolean;
  accounts: number;
  whatsapp: number;
  message?: string;
}

export function useSaveZernioKey(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string | null) =>
      zernio<KeyResult>(accountId, "key.save", apiKey ? { apiKey } : {}),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["integrations", accountId] });
    },
  });
}

export function useTestZernio(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => zernio<KeyResult>(accountId, "key.test"),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["integrations", accountId] }),
  });
}

export function useConnectWhatsApp(accountId: string) {
  return useMutation({
    mutationFn: (coexistence: boolean) =>
      zernio<{ url: string }>(accountId, "whatsapp.connect_url", {
        coexistence,
        redirectUrl: `${window.location.origin}/canais`,
      }),
  });
}

export function useWhatsAppConnected(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { zernioAccountId: string | null; coexistence: boolean }) =>
      zernio<{ synced: number; found: number }>(accountId, "whatsapp.connected", {
        ...(p.zernioAccountId ? { zernioAccountId: p.zernioAccountId } : {}),
        coexistence: p.coexistence,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: channelsKey(accountId) }),
  });
}

// ------------------------------------------------------------------ números

export function useZernioNumbers(accountId: string) {
  return useQuery({
    queryKey: zernioKeys.numbers(accountId),
    queryFn: async (): Promise<ZernioNumber[]> => {
      const { data, error } = await supabase
        .from("zernio_numbers")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSyncNumbers(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      zernio<{ numbers: ZernioNumber[]; connected: number }>(accountId, "numbers.list"),
    onSuccess: (r) => qc.setQueryData(zernioKeys.numbers(accountId), r.numbers),
  });
}

export interface Catalog {
  country: string;
  offers: NumberOffer[];
  areas: { ndc: string; name: string }[];
  fetchedAt: string;
}

export function useNumberCatalog(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: zernioKeys.catalog(accountId),
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => zernio<Catalog>(accountId, "numbers.catalog", { country: "BR" }),
  });
}

export function useKycLink(accountId: string) {
  return useMutation({
    mutationFn: (p: { numberType: string; areaCode?: string }) =>
      zernio<{ url: string; expiresAt: string | null }>(accountId, "numbers.kyc_link", p),
  });
}

export interface PortCheckResult {
  phone: string;
  portable: boolean;
  reason?: string;
  supported?: boolean;
  numberType?: string;
  carrier?: string | null;
  requirements: { id: string; label: string; kind: string }[];
}

export function usePortCheck(accountId: string) {
  return useMutation({
    mutationFn: (phone: string) => zernio<PortCheckResult>(accountId, "port.check", { phone }),
  });
}

export interface VoicePayload {
  numberId: string;
  forward: ForwardChoice;
  hours: HoursChoice;
  voicemail: boolean;
  greeting: string;
  recording: boolean;
  transcription: boolean;
}

export function useSaveVoice(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: VoicePayload) => zernio<{ ok: boolean }>(accountId, "voice.save", { ...p }),
    onSettled: () => void qc.invalidateQueries({ queryKey: zernioKeys.numbers(accountId) }),
  });
}

// ------------------------------------------------------------------ ligação pelo WhatsApp

export interface CallingState {
  phoneNumber?: string;
  callingEnabled?: boolean;
  callDeepLink?: string | null;
  forwardTo?: string | null;
  recordingEnabled?: boolean;
  maxCallDurationSeconds?: number | null;
  coexistence: boolean;
}

export function useCalling(accountId: string, channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: zernioKeys.calling(accountId, channelId),
    enabled,
    retry: false,
    queryFn: () => zernio<CallingState>(accountId, "calling.get", { channelId }),
  });
}

export function useSaveCalling(accountId: string, channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { forward: ForwardChoice; recording: boolean; maxMinutes: number }) =>
      zernio<{ ok: boolean; callingEnabled: boolean }>(accountId, "calling.save", {
        channelId,
        ...p,
      }),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: zernioKeys.calling(accountId, channelId) }),
  });
}

export type CallPermission = Tables<"zernio_call_permissions">;

export function useCallPermission(accountId: string, contactId: string) {
  return useQuery({
    queryKey: zernioKeys.permission(accountId, contactId),
    queryFn: async (): Promise<CallPermission | null> => {
      const { data, error } = await supabase
        .from("zernio_call_permissions")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAskPermission(accountId: string, contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      zernio<{ status: "granted" | "requested" }>(accountId, "permission.request", {
        channelId,
        contactId,
      }),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: zernioKeys.permission(accountId, contactId) }),
  });
}

export function useCallOnWhatsApp(accountId: string, contactId: string) {
  return useMutation({
    mutationFn: (channelId: string) =>
      zernio<{ callId: string | null; status: string }>(accountId, "call.whatsapp", {
        channelId,
        contactId,
      }),
  });
}

// ------------------------------------------------------------------ saúde

export type HealthRow = NumberHealthRow & { verdict: HealthVerdict };

export function useNumberHealth(accountId: string, enabled = true) {
  return useQuery({
    queryKey: zernioKeys.health(accountId),
    enabled,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: () =>
      zernio<{ numbers: HealthRow[] }>(accountId, "health", { hours: 24 }).then((r) => r.numbers),
  });
}
