import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import type { ExitRules, Graph, Guards, Trigger } from "./engine";

export type AutomationRow = Tables<"automations">;
export interface Automation extends Omit<
  AutomationRow,
  "graph" | "trigger" | "exit_rules" | "guards"
> {
  graph: Graph;
  trigger: Trigger;
  exit_rules: ExitRules;
  guards: Guards;
}
export interface AutomationStats {
  active: number;
  done: number;
  exited: number;
  total: number;
  converted: number;
}

export const automationKeys = {
  all: (accountId: string) => ["automations", accountId] as const,
  one: (id: string) => ["automation", id] as const,
  runs: (id: string) => ["automation-runs", id] as const,
};

function cast(row: AutomationRow): Automation {
  return row as unknown as Automation;
}

export function useAutomations(accountId: string) {
  return useQuery({
    queryKey: automationKeys.all(accountId),
    queryFn: async () => {
      const [list, stats] = await Promise.all([
        supabase
          .from("automations")
          .select("*")
          .eq("account_id", accountId)
          .neq("status", "archived")
          .order("updated_at", { ascending: false }),
        supabase.rpc("automation_stats", { _account: accountId }),
      ]);
      if (list.error) throw list.error;
      const byId = new Map((stats.data ?? []).map((s) => [s.automation_id, s]));
      return (list.data ?? []).map((a) => ({
        ...cast(a),
        stats: (byId.get(a.id) ?? {
          active: 0,
          done: 0,
          exited: 0,
          total: 0,
          converted: 0,
        }) as AutomationStats,
      }));
    },
  });
}

export function useAutomation(id: string) {
  return useQuery({
    queryKey: automationKeys.one(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? cast(data) : null;
    },
  });
}

export function useSaveAutomation(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Automation> & { id?: string; name: string }) => {
      const { id, ...rest } = input;
      const values = {
        ...rest,
        ...(rest.graph ? { graph: rest.graph as unknown as Json } : {}),
        ...(rest.trigger ? { trigger: rest.trigger as unknown as Json } : {}),
        ...(rest.exit_rules ? { exit_rules: rest.exit_rules as unknown as Json } : {}),
        ...(rest.guards ? { guards: rest.guards as unknown as Json } : {}),
      } as Record<string, unknown>;
      delete values["stats"];
      if (id) {
        const { data, error } = await supabase
          .from("automations")
          .update(values as never)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return cast(data);
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("automations")
        .insert({ ...values, account_id: accountId, created_by: u.user?.id ?? null } as never)
        .select()
        .single();
      if (error) throw error;
      return cast(data);
    },
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: automationKeys.all(accountId) });
      qc.setQueryData(automationKeys.one(a.id), a);
    },
  });
}

export function useDeleteAutomation(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automations")
        .update({ status: "archived" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: automationKeys.all(accountId) }),
  });
}

type Action = "activate" | "pause" | "enroll" | "preview" | "simulate" | "stop_run";
export interface ActionInput {
  action: Action;
  automationId?: string;
  contactIds?: string[];
  segmentId?: string;
  dealId?: string;
  contactId?: string;
  runId?: string;
}
export function useAutomationAction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActionInput) =>
      callApi<unknown>("/api/automations", { accountId, ...input }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: automationKeys.all(accountId) });
      if (v.automationId) {
        void qc.invalidateQueries({ queryKey: automationKeys.one(v.automationId) });
        void qc.invalidateQueries({ queryKey: automationKeys.runs(v.automationId) });
      }
    },
  });
}

export function useAutomationRuns(automationId: string) {
  return useQuery({
    queryKey: automationKeys.runs(automationId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_runs")
        .select(
          "id, status, current_node, next_at, enrolled_at, finished_at, exit_reason, source, contact_id, contacts(name, phone, email)",
        )
        .eq("automation_id", automationId)
        .order("enrolled_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAutomationLogs(automationId: string) {
  return useQuery({
    queryKey: ["automation-logs", automationId],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_logs")
        .select("id, node_id, node_type, status, message, created_at, contact_id, contacts(name)")
        .eq("automation_id", automationId)
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActiveAutomations(accountId: string, kind?: "sequence" | "journey") {
  return useQuery({
    queryKey: ["automations-active", accountId, kind],
    queryFn: async () => {
      let q = supabase
        .from("automations")
        .select("id, name, kind")
        .eq("account_id", accountId)
        .eq("status", "active")
        .order("name");
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface TodayStats {
  /** Inscrições (contatos) que tiveram algum passo executado hoje. */
  runs: number;
  ok: number;
  failed: number;
}

const PAGE = 1000;
const MAX_PAGES = 20;

// Execuções de hoje por automação, lidas do registro de passos (automation_logs). Pagina porque o
// PostgREST corta em 1.000 linhas sem avisar.
export function useAutomationsToday(accountId: string) {
  return useQuery({
    queryKey: [...automationKeys.all(accountId), "today"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const rows: { automation_id: string; run_id: string | null; status: string }[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from("automation_logs")
          .select("automation_id, run_id, status")
          .eq("account_id", accountId)
          .gte("created_at", start.toISOString())
          .in("status", ["ok", "failed"])
          .order("id")
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < PAGE) break;
      }
      const acc = new Map<string, { runs: Set<string>; ok: number; failed: number }>();
      for (const r of rows) {
        const cur = acc.get(r.automation_id) ?? { runs: new Set<string>(), ok: 0, failed: 0 };
        if (r.run_id) cur.runs.add(r.run_id);
        if (r.status === "ok") cur.ok += 1;
        else cur.failed += 1;
        acc.set(r.automation_id, cur);
      }
      return new Map<string, TodayStats>(
        [...acc.entries()].map(([id, v]) => [
          id,
          { runs: v.runs.size, ok: v.ok, failed: v.failed },
        ]),
      );
    },
  });
}
