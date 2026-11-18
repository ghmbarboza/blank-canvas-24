// Dados da fila única: presença, minha fila, painel ao vivo, indicadores e configuração.
import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import type { AgentState, DialingRules, SuperviseMode } from "./lib";

export type WorkItem = Tables<"work_items">;
export type QueueAgent = Tables<"queue_agents">;
export type AgentSkill = Tables<"agent_skills">;
export type Presence = Tables<"agent_presence">;
export type Queue = Tables<"call_queues">;
export type CallCenterSettings = Tables<"call_center_settings">;

export const qKeys = {
  all: (a: string) => ["queue", a] as const,
  presence: (a: string, u: string) => ["queue", a, "presence", u] as const,
  mine: (a: string, u: string) => ["queue", a, "mine", u] as const,
  live: (a: string) => ["queue", a, "live"] as const,
  indicators: (a: string, days: number) => ["queue", a, "indicators", days] as const,
  team: (a: string) => ["queue", a, "team"] as const,
  queues: (a: string) => ["queue", a, "queues"] as const,
  settings: (a: string) => ["queue", a, "settings"] as const,
  selfTest: (a: string) => ["queue", a, "self-test"] as const,
};

const ACTIVE: WorkItem["status"][] = ["reserved", "assigned", "wrap_up"];

/** Escuta work_items e presença da conta e invalida tudo da fila (Realtime). */
export function useQueueRealtime(accountId: string, enabled = true) {
  const qc = useQueryClient();
  // Um canal por componente: o mesmo nome em dois lugares quebra o subscribe do Realtime.
  const uid = useId();
  useEffect(() => {
    if (!enabled || !accountId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        void qc.invalidateQueries({ queryKey: qKeys.all(accountId) });
      }, 400);
    };
    const ch = supabase
      .channel(`queue-${accountId}-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_items", filter: `account_id=eq.${accountId}` },
        bump,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_presence",
          filter: `account_id=eq.${accountId}`,
        },
        bump,
      )
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      void supabase.removeChannel(ch);
    };
  }, [accountId, enabled, qc, uid]);
}

// ───────────────────────── presença ─────────────────────────
export function useMyAgent(accountId: string, userId: string | undefined) {
  return useQuery({
    queryKey: qKeys.presence(accountId, userId ?? ""),
    enabled: Boolean(accountId && userId),
    queryFn: async () => {
      const [qa, p] = await Promise.all([
        supabase
          .from("queue_agents")
          .select("*")
          .eq("account_id", accountId)
          .eq("user_id", userId!)
          .maybeSingle(),
        supabase
          .from("agent_presence")
          .select("*")
          .eq("account_id", accountId)
          .eq("user_id", userId!)
          .maybeSingle(),
      ]);
      if (qa.error) throw qa.error;
      if (p.error) throw p.error;
      return { agent: qa.data, presence: p.data };
    },
  });
}

export function useSetPresence(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { status: "available" | "paused" | "offline"; reason?: string }) => {
      const { data, error } = await supabase.rpc("set_presence", {
        _account: accountId,
        _status: v.status,
        ...(v.reason ? { _reason: v.reason } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qKeys.all(accountId) }),
  });
}

// ───────────────────────── minha fila ─────────────────────────
export type MyItem = WorkItem & {
  contacts: { id: string; name: string | null; phone: string | null } | null;
};

export function useMyItems(accountId: string, userId: string | undefined) {
  return useQuery({
    queryKey: qKeys.mine(accountId, userId ?? ""),
    enabled: Boolean(accountId && userId),
    queryFn: async () => {
      const mine = await supabase
        .from("work_items")
        .select("*, contacts(id, name, phone)")
        .eq("account_id", accountId)
        .in("status", ACTIVE)
        .or(`assigned_user_id.eq.${userId},reserved_user_id.eq.${userId}`)
        .order("created_at", { ascending: true })
        .limit(50);
      if (mine.error) throw mine.error;
      const waiting = await supabase
        .from("work_items")
        .select("id, channel, created_at, sla_due_at", { count: "exact" })
        .eq("account_id", accountId)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(200);
      if (waiting.error) throw waiting.error;
      return {
        items: (mine.data ?? []) as unknown as MyItem[],
        waiting: waiting.count ?? waiting.data?.length ?? 0,
        waitingByChannel: (waiting.data ?? []).reduce<Record<string, number>>((acc, w) => {
          acc[w.channel] = (acc[w.channel] ?? 0) + 1;
          return acc;
        }, {}),
      };
    },
  });
}

function useQueueMutation<V, R>(accountId: string, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: qKeys.all(accountId) }),
  });
}

export function useClaimNext(accountId: string) {
  return useQueueMutation(accountId, async () => {
    const { data, error } = await supabase.rpc("claim_next_work_item", { _account: accountId });
    if (error) throw error;
    const w = data as unknown as WorkItem | null;
    return w?.id ? w : null;
  });
}

export function useAcceptItem(accountId: string) {
  return useQueueMutation(accountId, async (id: string) => {
    const { error } = await supabase.rpc("accept_work_item", { _item: id });
    if (error) throw error;
  });
}

export function useDeclineItem(accountId: string) {
  return useQueueMutation(accountId, async (id: string) => {
    const { error } = await supabase.rpc("decline_work_item", { _item: id });
    if (error) throw error;
  });
}

export function useFinishItem(accountId: string) {
  return useQueueMutation(accountId, async (id: string) => {
    const { error } = await supabase.rpc("finish_work_item", { _item: id });
    if (error) throw error;
  });
}

export function useConfirmWrap(accountId: string) {
  return useQueueMutation(
    accountId,
    async (v: { id: string; reason: string; result: string; next: string; dueDays: number }) => {
      const due = new Date(Date.now() + Math.max(0, v.dueDays) * 86_400_000).toISOString();
      const { error } = await supabase.rpc("confirm_wrap_up", {
        _item: v.id,
        _reason: v.reason,
        _result: v.result,
        _next_action: v.next,
        _next_due: due,
      });
      if (error) throw error;
    },
  );
}

export function useRegenerateWrap(accountId: string) {
  return useQueueMutation(accountId, (id: string) =>
    callApi<{ ok: boolean }>("/api/callcenter", {
      accountId,
      action: "regenerate_wrap",
      workItemId: id,
    }),
  );
}

export function useRequestCallback(accountId: string) {
  return useQueueMutation(
    accountId,
    async (v: {
      phone: string;
      contactId?: string | null;
      when?: string | null;
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc("request_callback", {
        _account: accountId,
        _phone: v.phone,
        ...(v.contactId ? { _contact: v.contactId } : {}),
        ...(v.when ? { _when: v.when } : {}),
        ...(v.note ? { _note: v.note } : {}),
      });
      if (error) throw error;
      return data;
    },
  );
}

export interface TransferResult {
  ok: boolean;
  target_name: string;
  target_extension: string | null;
  code: string | null;
}

export function useTransferBrief(accountId: string) {
  return useMutation({
    mutationFn: (v: { workItemId: string; targetUserId: string; note: string }) =>
      callApi<TransferResult>("/api/callcenter", { accountId, action: "transfer_brief", ...v }),
  });
}

// ───────────────────────── painel ao vivo ─────────────────────────
export interface LiveAgent {
  user_id: string;
  name: string;
  state: AgentState;
  pause_reason: string | null;
  since: string | null;
  wrap_up_until: string | null;
  load: number;
  extension: string | null;
  voice: number;
  chat: number;
  other: number;
  current_voice: { id: string; kind: string; subject: string | null; since: string | null } | null;
}

export interface LiveStats {
  generated_at: string;
  waiting_total: number;
  longest_wait_seconds: number;
  callbacks_pending: number;
  queue: {
    channel: string;
    waiting: number;
    oldest_wait_seconds: number;
    breached: number;
    at_risk: number;
  }[];
  agents: LiveAgent[];
  agent_states: Record<AgentState, number>;
  today: {
    offered: number;
    answered: number;
    abandoned: number;
    abandon_rate: number | null;
    sla_met_pct: number | null;
    tme_seconds: number | null;
    tma_seconds: number | null;
    resolved: number;
    ai_touched: number;
    ai_resolved: number;
    ai_resolution_pct: number | null;
  };
}

export function useLive(accountId: string) {
  useQueueRealtime(accountId);
  return useQuery({
    queryKey: qKeys.live(accountId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cc_live", { _account: accountId });
      if (error) throw error;
      return data as unknown as LiveStats;
    },
  });
}

export interface IndicatorRow {
  offered: number;
  answered: number;
  abandoned: number;
  tme_seconds: number | null;
  tma_seconds: number | null;
  fcr_pct: number | null;
  abandon_pct: number | null;
  sla_met_pct: number | null;
  handle_seconds: number;
  name?: string;
  occupancy_pct?: number | null;
  logged_seconds?: number;
}

export interface Indicators {
  total: IndicatorRow | null;
  by_queue: (IndicatorRow & { queue_id: string | null; name: string })[];
  by_agent: (IndicatorRow & { assigned_user_id: string; name: string })[];
  /** corte por canal de atendimento (#74); ausente em bancos antes da migração */
  by_channel?: (IndicatorRow & { channel: string })[];
  by_ai_agent: {
    voice_agent_id: string;
    name: string;
    calls: number;
    answered: number;
    tma_seconds: number | null;
    transferred: number;
    resolution_pct: number | null;
  }[];
}

export function useIndicators(accountId: string, days: number) {
  return useQuery({
    queryKey: qKeys.indicators(accountId, days),
    queryFn: async () => {
      const to = new Date(Date.now() + 60_000);
      const from = new Date(to.getTime() - days * 86_400_000);
      const { data, error } = await supabase.rpc("cc_indicators", {
        _account: accountId,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) throw error;
      return data as unknown as Indicators;
    },
  });
}

export interface SuperviseInfo {
  target_extension: string;
  my_extension: string | null;
  supervisor_enabled: boolean | null;
  steps: string[];
}

export function useSuperviseInfo(accountId: string) {
  return useMutation({
    mutationFn: (v: { userId: string; mode: SuperviseMode }) =>
      callApi<SuperviseInfo>("/api/callcenter", { accountId, action: "supervise_info", ...v }),
  });
}

export function useSupervisorEnable(accountId: string) {
  return useMutation({
    mutationFn: () =>
      callApi<{ ok: boolean; extension: string }>("/api/callcenter", {
        accountId,
        action: "supervisor_enable",
      }),
  });
}

export interface ZadarmaCheck {
  pbx_id: number | null;
  pbx_extensions: string[];
  extensions: { user_id: string; extension: string; found: boolean; supervisor: boolean }[];
}

export function useZadarmaCheck(accountId: string) {
  return useMutation({
    mutationFn: () =>
      callApi<ZadarmaCheck>("/api/callcenter", { accountId, action: "zadarma_check" }),
  });
}

// ───────────────────────── equipe, filas e regras (gestor) ─────────────────────────
export interface TeamRow {
  userId: string;
  name: string;
  role: string;
  agent: QueueAgent | null;
  skills: AgentSkill[];
  extension: string | null;
}

export function useCallCenterTeam(accountId: string) {
  return useQuery({
    queryKey: qKeys.team(accountId),
    queryFn: async (): Promise<TeamRow[]> => {
      const [m, qa, sk, ext] = await Promise.all([
        supabase
          .from("memberships")
          .select("user_id, role, display_name")
          .eq("account_id", accountId)
          .eq("is_active", true),
        supabase.from("queue_agents").select("*").eq("account_id", accountId),
        supabase.from("agent_skills").select("*").eq("account_id", accountId),
        supabase
          .from("telephony_extensions")
          .select("user_id, extension, is_active")
          .eq("account_id", accountId),
      ]);
      for (const r of [m, qa, sk, ext]) if (r.error) throw r.error;
      const ids = (m.data ?? []).map((r) => r.user_id);
      const prof = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [], error: null };
      if (prof.error) throw prof.error;
      const names = new Map((prof.data ?? []).map((p) => [p.id, p.full_name]));
      return (m.data ?? [])
        .map((r) => ({
          userId: r.user_id,
          name: r.display_name || names.get(r.user_id) || "Sem nome",
          role: r.role,
          agent: (qa.data ?? []).find((a) => a.user_id === r.user_id) ?? null,
          skills: (sk.data ?? []).filter((s) => s.user_id === r.user_id),
          extension:
            (ext.data ?? []).find((e) => e.user_id === r.user_id && e.is_active)?.extension ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
  });
}

export function useSaveAgent(accountId: string) {
  return useQueueMutation(
    accountId,
    async (v: {
      userId: string;
      patch: Omit<TablesUpdate<"queue_agents">, "account_id" | "user_id">;
    }) => {
      const row: TablesInsert<"queue_agents"> = {
        account_id: accountId,
        user_id: v.userId,
        ...v.patch,
      };
      const { error } = await supabase.from("queue_agents").upsert(row);
      if (error) throw error;
    },
  );
}

export function useSetSkill(accountId: string) {
  return useQueueMutation(
    accountId,
    async (v: { userId: string; skill: string; level: number | null }) => {
      if (v.level === null) {
        const { error } = await supabase
          .from("agent_skills")
          .delete()
          .eq("account_id", accountId)
          .eq("user_id", v.userId)
          .eq("skill", v.skill);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("agent_skills")
        .upsert({ account_id: accountId, user_id: v.userId, skill: v.skill, level: v.level });
      if (error) throw error;
    },
  );
}

export function useQueues(accountId: string) {
  return useQuery({
    queryKey: qKeys.queues(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_queues")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveQueue(accountId: string) {
  return useQueueMutation(
    accountId,
    async (v: { id?: string; patch: Omit<TablesUpdate<"call_queues">, "account_id"> }) => {
      if (v.id) {
        const { error } = await supabase
          .from("call_queues")
          .update(v.patch)
          .eq("id", v.id)
          .eq("account_id", accountId);
        if (error) throw error;
        return;
      }
      const row: TablesInsert<"call_queues"> = {
        account_id: accountId,
        name: v.patch.name ?? "Atendimento",
        ...v.patch,
      };
      const { error } = await supabase.from("call_queues").insert(row);
      if (error) throw error;
    },
  );
}

export function useCallCenterSettings(accountId: string) {
  return useQuery({
    queryKey: qKeys.settings(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_center_settings")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveSettings(accountId: string) {
  return useQueueMutation(
    accountId,
    async (patch: Omit<TablesUpdate<"call_center_settings">, "account_id">) => {
      const { error } = await supabase
        .from("call_center_settings")
        .upsert({ account_id: accountId, ...patch });
      if (error) throw error;
    },
  );
}

export function useSaveDialing(accountId: string, userId: string | undefined) {
  return useQueueMutation(accountId, async (rules: DialingRules) => {
    const { error } = await supabase.from("call_center_settings").upsert({
      account_id: accountId,
      dialing: rules as unknown as Json,
      dialing_accepted_at: new Date().toISOString(),
      dialing_accepted_by: userId ?? null,
    });
    if (error) throw error;
  });
}

export function useImportDnc(accountId: string) {
  return useMutation({
    mutationFn: async (numbers: string[]) => {
      const { data, error } = await supabase.rpc("import_dnc_numbers", {
        _account: accountId,
        _numbers: numbers,
      });
      if (error) throw error;
      return data as unknown as { received: number; valid: number; added: number };
    },
  });
}

export function useDncCount(accountId: string) {
  return useQuery({
    queryKey: [...qKeys.settings(accountId), "dnc"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("suppressions")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("channel", "voice");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useCampaignDialing(accountId: string) {
  return useQuery({
    queryKey: [...qKeys.settings(accountId), "campaigns"],
    queryFn: async () => {
      const [c, n] = await Promise.all([
        supabase
          .from("voice_campaigns")
          .select("id, name, status, dial_prefix, phone_number_id")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("phone_numbers")
          .select("id, number, label")
          .eq("account_id", accountId)
          .eq("is_active", true),
      ]);
      if (c.error) throw c.error;
      if (n.error) throw n.error;
      return { campaigns: c.data ?? [], numbers: n.data ?? [] };
    },
  });
}

export function useSaveCampaignDialing(accountId: string) {
  return useQueueMutation(
    accountId,
    async (v: { id: string; dial_prefix: string | null; phone_number_id: string | null }) => {
      const { error } = await supabase
        .from("voice_campaigns")
        .update({ dial_prefix: v.dial_prefix, phone_number_id: v.phone_number_id })
        .eq("id", v.id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
  );
}

export interface SelfTest {
  team: number;
  team_with_skills: number;
  ok: boolean;
  queues: {
    id: string;
    name: string;
    channels: string[];
    skill: string | null;
    required_level: number;
    eligible: number;
    available_now: number;
  }[];
}

export function useSelfTest(accountId: string) {
  return useQuery({
    queryKey: qKeys.selfTest(accountId),
    enabled: Boolean(accountId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cc_self_test", { _account: accountId });
      if (error) throw error;
      return data as unknown as SelfTest;
    },
  });
}
