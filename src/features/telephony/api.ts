import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

export type Call = Tables<"calls">;
export type VoiceAgent = Tables<"voice_agents">;
export type VoiceCampaign = Tables<"voice_campaigns">;
export type PhoneNumber = Tables<"phone_numbers">;
export type Extension = Tables<"telephony_extensions">;
export type CallQueue = Tables<"call_queues">;
export type IvrMenu = Tables<"ivr_menus">;

export const telKeys = {
  calls: (a: string) => ["calls", a] as const,
  stats: (a: string) => ["call-stats", a] as const,
  agents: (a: string) => ["voice-agents", a] as const,
  campaigns: (a: string) => ["voice-campaigns", a] as const,
  numbers: (a: string) => ["phone-numbers", a] as const,
  extensions: (a: string) => ["telephony-extensions", a] as const,
  queues: (a: string) => ["call-queues", a] as const,
  ivr: (a: string) => ["ivr-menus", a] as const,
};

export interface CallFilters {
  direction: "all" | "inbound" | "outbound";
  who: "all" | "human" | "ai";
  status: "all" | "answered" | "missed";
  days: number;
  contactId?: string | null;
}

export type CallRow = Call & { contacts: { id: string; name: string | null } | null };

/** Uma ligação pelo id (link direto da biblioteca), mesmo fora do período filtrado. */
export function useCall(accountId: string, callId: string | undefined) {
  return useQuery({
    queryKey: [...telKeys.calls(accountId), "one", callId],
    enabled: Boolean(callId),
    queryFn: async (): Promise<CallRow | null> => {
      const { data, error } = await supabase
        .from("calls")
        .select("*, contacts(id, name)")
        .eq("account_id", accountId)
        .eq("id", callId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CallRow | null) ?? null;
    },
  });
}

export function useCalls(accountId: string, f: CallFilters) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...telKeys.calls(accountId), f],
    queryFn: async (): Promise<CallRow[]> => {
      let query = supabase
        .from("calls")
        .select("*, contacts(id, name)")
        .eq("account_id", accountId)
        .gte("started_at", new Date(Date.now() - f.days * 86_400_000).toISOString())
        .order("started_at", { ascending: false })
        .limit(300);
      if (f.direction !== "all") query = query.eq("direction", f.direction);
      if (f.who === "ai") query = query.not("voice_agent_id", "is", null);
      if (f.who === "human") query = query.is("voice_agent_id", null);
      if (f.status === "answered") query = query.not("answered_at", "is", null);
      if (f.status === "missed")
        query = query
          .is("answered_at", null)
          .in("status", ["missed", "no_answer", "busy", "failed", "canceled"]);
      if (f.contactId) query = query.eq("contact_id", f.contactId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CallRow[];
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`calls-${accountId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `account_id=eq.${accountId}` },
        () => {
          void qc.invalidateQueries({ queryKey: telKeys.calls(accountId) });
          void qc.invalidateQueries({ queryKey: telKeys.stats(accountId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [accountId, qc]);
  return q;
}

export interface CallCenterStats {
  waiting: number;
  in_progress: number;
  today_total: number;
  today_inbound: number;
  today_outbound: number;
  today_ai: number;
  answered: number;
  abandoned: number;
  avg_wait_seconds: number;
  avg_talk_seconds: number;
  service_level: number | null;
  sla_seconds: number;
  /** Base da ocupação: hoje só "business_hours" (janela do expediente; não há tempo logado). */
  occupancy_basis?: "business_hours";
  window_seconds?: number;
  agents_with_extension?: number;
  agents?: { user_id: string; calls: number; talk_seconds: number }[];
}

export function useCallStats(accountId: string) {
  return useQuery({
    queryKey: telKeys.stats(accountId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("call_center_stats", { _account: accountId });
      if (error) throw error;
      return data as unknown as CallCenterStats;
    },
  });
}

function tableHooks<
  T extends
    | "voice_agents"
    | "voice_campaigns"
    | "phone_numbers"
    | "telephony_extensions"
    | "call_queues"
    | "ivr_menus",
>(table: T, key: (a: string) => readonly unknown[], order: string) {
  function useList(accountId: string) {
    return useQuery({
      queryKey: key(accountId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("account_id" as never, accountId as never)
          .order(order as never);
        if (error) throw error;
        return (data ?? []) as unknown as Tables<T>[];
      },
    });
  }
  function useSave(accountId: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (input: { id?: string; values: Partial<TablesInsert<T>> }) => {
        if (input.id) {
          const { data, error } = await supabase
            .from(table)
            .update(input.values as TablesUpdate<T> as never)
            .eq("id" as never, input.id as never)
            .select()
            .single();
          if (error) throw error;
          return data as unknown as Tables<T>;
        }
        const { data, error } = await supabase
          .from(table)
          .insert({ ...input.values, account_id: accountId } as never)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as Tables<T>;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: key(accountId) }),
    });
  }
  function useRemove(accountId: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("id" as never, id as never);
        if (error) throw error;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: key(accountId) }),
    });
  }
  return { useList, useSave, useRemove };
}

export const voiceAgents = tableHooks("voice_agents", telKeys.agents, "name");
export const voiceCampaigns = tableHooks("voice_campaigns", telKeys.campaigns, "created_at");
export const phoneNumbers = tableHooks("phone_numbers", telKeys.numbers, "number");
export const extensions = tableHooks("telephony_extensions", telKeys.extensions, "extension");
export const queues = tableHooks("call_queues", telKeys.queues, "name");
export const ivrMenus = tableHooks("ivr_menus", telKeys.ivr, "name");

export function useCampaignProgress(accountId: string, campaignIds: string[]) {
  return useQuery({
    queryKey: ["voice-campaign-progress", accountId, campaignIds],
    enabled: campaignIds.length > 0,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voice_campaign_targets")
        .select("campaign_id, status")
        .in("campaign_id", campaignIds)
        .limit(20_000);
      if (error) throw error;
      const out = new Map<string, Record<string, number>>();
      for (const r of data ?? []) {
        const m = out.get(r.campaign_id) ?? {};
        m[r.status] = (m[r.status] ?? 0) + 1;
        out.set(r.campaign_id, m);
      }
      return out;
    },
  });
}

// ───────────────────────── ações no servidor ─────────────────────────
export const telephonyApi = {
  callback: (
    accountId: string,
    input: { contactId?: string | null; phone?: string | null; via?: "softphone" | "mobile" },
  ) =>
    callApi<{ ok: true; to: string; from: string }>("/api/telephony", {
      accountId,
      action: "callback",
      ...input,
    }),
  webrtcKey: (accountId: string) =>
    callApi<{ key: string; sip: string; extension: string }>("/api/telephony", {
      accountId,
      action: "webrtc_key",
    }),
  createExtension: (accountId: string, userId: string, startNumber?: string) =>
    callApi<{ id: string; extension: string; sip_login: string | null }>("/api/telephony", {
      accountId,
      action: "create_extension",
      userId,
      ...(startNumber ? { startNumber } : {}),
    }),
  balance: (accountId: string) =>
    callApi<{
      balance: number;
      currency: string;
      calls_left: number | null;
      threshold_calls: number;
      low: boolean;
    }>("/api/telephony", { accountId, action: "balance" }),
  deepgramToken: (accountId: string) =>
    callApi<{ token: string; expires_in: number }>("/api/telephony", {
      accountId,
      action: "deepgram_token",
    }),
  recording: (accountId: string, callId: string) =>
    callApi<{ url: string }>("/api/telephony", { accountId, action: "recording", callId }),
  coach: (accountId: string, transcript: string, contactId?: string | null) =>
    callApi<{ tips: { kind: string; title: string; text: string }[] }>("/api/telephony", {
      accountId,
      action: "coach",
      transcript,
      contactId: contactId ?? null,
    }),
  /** Liga agora para o contato pela IA de voz; o resultado volta para a ficha. */
  callContact: (accountId: string, contactId: string, motivo: string, agentId?: string | null) =>
    callApi<{ ok: true }>("/api/voice", {
      accountId,
      action: "call_contact",
      contactId,
      motivo,
      agentId: agentId ?? null,
    }),
  publishAgent: (accountId: string, agentId: string) =>
    callApi<{
      elevenlabs_agent_id: string;
      diff: { field: string; expected: string; actual: string }[];
    }>("/api/voice", { accountId, action: "publish_agent", agentId }),
  registerNumber: (accountId: string, phoneId: string, sipPassword: string | null) =>
    callApi<{ elevenlabs_phone_id: string; assigned_agent: string | null }>("/api/voice", {
      accountId,
      action: "register_number",
      phoneId,
      sipPassword,
    }),
  testAgent: (
    accountId: string,
    agentId: string,
    messages: { role: "user" | "assistant"; content: string }[],
  ) =>
    callApi<{ reply: string; tool: string | null }>("/api/voice", {
      accountId,
      action: "test_agent",
      agentId,
      messages,
    }),
  voices: (accountId: string) =>
    callApi<{
      voices: {
        voice_id: string;
        name: string;
        accent: string | null;
        preview_url: string | null;
      }[];
    }>("/api/voice", { accountId, action: "voices" }),
  enroll: (accountId: string, campaignId: string) =>
    callApi<{ added: number; skipped: number }>("/api/voice", {
      accountId,
      action: "enroll_campaign",
      campaignId,
    }),
  campaignStatus: (
    accountId: string,
    campaignId: string,
    status: "running" | "paused" | "canceled",
  ) =>
    callApi<{ ok: true }>("/api/voice", {
      accountId,
      action: "campaign_status",
      campaignId,
      status,
    }),
};
