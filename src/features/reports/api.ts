import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import type { ReportChart, ReportConfig, ReportRow } from "./lib";

export interface Range {
  from: string;
  to: string;
}

export interface SalesReport {
  pipeline_id: string | null;
  funnel: {
    stage_id: string;
    name: string;
    kind: string;
    probability: number;
    color: string | null;
    reached: number;
    current_count: number;
    current_value: number;
  }[];
  totals: {
    created: number;
    won: number;
    lost: number;
    won_value: number;
    avg_ticket: number;
    win_rate: number | null;
    avg_cycle_days: number | null;
  };
  lost_reasons: { reason: string; count: number; value: number }[];
  by_owner: {
    user_id: string | null;
    name: string;
    won: number;
    won_value: number;
    lost: number;
    open_value: number;
  }[];
  by_product: { name: string; quantity: number; revenue: number }[];
  monthly: { month: string; created: number; won: number; won_value: number }[];
}

export interface ForecastReport {
  months: {
    month: string;
    pipeline: number;
    weighted: number;
    commit: number;
    best_case: number;
    deals: number;
    won: number;
  }[];
  overdue: { deals: number; value: number };
  undated: { deals: number; value: number };
  by_owner: {
    user_id: string | null;
    name: string;
    pipeline: number;
    weighted: number;
    commit: number;
    best_case: number;
  }[];
  risks: {
    id: string;
    title: string;
    value: number;
    owner_user_id: string | null;
    expected_close_date: string | null;
    category: string;
    flags: string[];
  }[];
  history: { taken_on: string; weighted: number; commit: number; best_case: number }[];
}

export interface AttributionCampaign {
  campaign: string;
  /** Rede ou site do primeiro toque (instagram, facebook, google…). */
  source?: string;
  /** Veio de anúncio pago. */
  paid?: boolean;
  leads: number;
  /** Leads com negócio em andamento. */
  open_deals?: number;
  /** Negócios ganhos desses leads. */
  won?: number;
  revenue: number;
}

export interface AttributionReport {
  first_touch: { source: string; leads: number; revenue: number; deals: number; paid?: number }[];
  last_touch: { source: string; revenue: number; deals: number }[];
  campaigns: AttributionCampaign[];
  totals?: { leads: number; paid_leads: number; with_origin: number };
}

export interface ActivityReport {
  total: number;
  avg_minutes: number | null;
  total_minutes: number;
  by_direction: Record<string, number>;
  by_status: Record<string, number>;
  daily: { day: string; count: number }[];
}

export interface AiReport {
  llm_monthly: {
    month: string;
    calls: number;
    errors: number;
    input_tokens: number;
    output_tokens: number;
  }[];
  by_purpose: { purpose: string; calls: number; tokens: number; avg_latency_ms: number }[];
  cost_monthly: { month: string; kind: string; cost_usd: number; quantity: number }[];
  resolution: { with_ai: number; without_human: number; rate: number | null };
}

const key = (accountId: string, name: string, ...rest: unknown[]) => [
  "report",
  accountId,
  name,
  ...rest,
];

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

export function useSalesReport(accountId: string, range: Range, pipelineId: string | null) {
  return useQuery({
    queryKey: key(accountId, "sales", range, pipelineId),
    queryFn: () =>
      rpc<SalesReport>("report_sales", {
        _account: accountId,
        _from: range.from,
        _to: range.to,
        ...(pipelineId ? { _pipeline: pipelineId } : {}),
      }),
  });
}

export function useForecastReport(accountId: string, months: number) {
  return useQuery({
    queryKey: key(accountId, "forecast", months),
    queryFn: () => rpc<ForecastReport>("report_forecast", { _account: accountId, _months: months }),
  });
}

export function useAttributionReport(accountId: string, range: Range) {
  return useQuery({
    queryKey: key(accountId, "attribution", range),
    queryFn: () =>
      rpc<AttributionReport>("report_attribution", {
        _account: accountId,
        _from: range.from,
        _to: range.to,
      }),
  });
}

export function useServiceReport(accountId: string, range: Range) {
  return useQuery({
    queryKey: key(accountId, "service", range),
    queryFn: () =>
      rpc<Record<string, unknown> | null>("report_service", {
        _account: accountId,
        _from: range.from,
        _to: range.to,
      }),
  });
}

export function useActivityReport(accountId: string, table: "calls" | "meetings", range: Range) {
  return useQuery({
    queryKey: key(accountId, table, range),
    queryFn: () =>
      rpc<ActivityReport | null>("report_activity_table", {
        _table: table,
        _account: accountId,
        _from: range.from,
        _to: range.to,
      }),
  });
}

export function useAiReport(accountId: string, months: number) {
  return useQuery({
    queryKey: key(accountId, "ai", months),
    queryFn: () => rpc<AiReport>("report_ai", { _account: accountId, _months: months }),
  });
}

export function useRunReport(accountId: string, config: ReportConfig | null) {
  return useQuery({
    queryKey: key(accountId, "builder", config),
    enabled: Boolean(config),
    queryFn: async () =>
      ((await rpc<ReportRow[]>("run_report", { _account: accountId, _config: config })) ?? []).map(
        (r) => ({ ...r, value: Number(r.value) }),
      ),
  });
}

export type SavedReport = Omit<Tables<"saved_reports">, "config" | "chart"> & {
  config: ReportConfig;
  chart: ReportChart;
};

export function useSavedReports(accountId: string) {
  return useQuery({
    queryKey: key(accountId, "saved"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_reports")
        .select("*")
        .eq("account_id", accountId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as SavedReport[];
    },
  });
}

export function useSaveReport(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      config: ReportConfig;
      chart: ReportChart;
      is_shared: boolean;
      schedule: "none" | "weekly";
      recipients: string[];
    }) => {
      const { id, ...values } = input;
      if (id) {
        const { data, error } = await supabase
          .from("saved_reports")
          .update({ ...values, config: values.config as never })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("saved_reports")
        .insert({
          ...values,
          config: values.config as never,
          account_id: accountId,
          created_by: u.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(accountId, "saved") }),
  });
}

export function useDeleteReport(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(accountId, "saved") }),
  });
}
