import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import type { Range } from "./api";

// Receita recorrente (report_mrr), operação (report_ops) e verba de mídia (ad_spend).
const key = (accountId: string, name: string, ...rest: unknown[]) => [
  "report",
  accountId,
  name,
  ...rest,
];

export interface MrrReport {
  current_mrr: number;
  active_customers: number;
  months: {
    month: string;
    mrr: number;
    new: number;
    expansion: number;
    contraction: number;
    churn: number;
  }[];
  top: {
    deal_id: string | null;
    title: string;
    contact: string | null;
    mrr: number;
    since: string;
  }[];
  renewals: {
    deal_id: string | null;
    title: string;
    contact: string | null;
    mrr: number;
    renew_on: string;
  }[];
}

export function useMrrReport(accountId: string, months: number) {
  return useQuery({
    queryKey: key(accountId, "mrr", months),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_mrr", {
        _account: accountId,
        _months: months,
      });
      if (error) throw error;
      return data as unknown as MrrReport;
    },
  });
}

export interface OpsReport {
  service: {
    sla_seconds: number;
    inbound: number;
    answered: number;
    abandoned: number;
    service_level: number | null;
    avg_wait_seconds: number | null;
    avg_talk_seconds: number | null;
    business_days: number;
    daily: { day: string; level: number; calls: number }[];
    agents: {
      user_id: string;
      name: string;
      calls: number;
      talk_minutes: number;
      occupancy: number | null;
    }[];
  };
  satisfaction: {
    csat_avg: number | null;
    csat_responses: number;
    csat_sent: number;
    csat_dist: Record<string, number>;
    nps_promoters: number;
    nps_passives: number;
    nps_detractors: number;
  };
  costs: {
    by_kind: Record<string, number>;
    conversation_usd: number;
    call_usd: number;
    conversations: number;
    calls: number;
  };
  leads: {
    total: number;
    months_from: string;
    months_to: string;
    by_channel: { channel: string; leads: number; spend: number | null }[];
  };
}

export function useOpsReport(accountId: string, range: Range) {
  return useQuery({
    queryKey: key(accountId, "ops", range),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("report_ops", {
        _account: accountId,
        _from: range.from,
        _to: range.to,
      });
      if (error) throw error;
      return data as unknown as OpsReport;
    },
  });
}

export type AdSpend = Tables<"ad_spend">;

export function useAdSpend(accountId: string) {
  return useQuery({
    queryKey: key(accountId, "ad_spend"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_spend")
        .select("*")
        .eq("account_id", accountId)
        .order("month", { ascending: false })
        .order("channel")
        .limit(120);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveAdSpend(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { month: string; channel: string; amount: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("ad_spend").upsert(
        {
          account_id: accountId,
          month: input.month,
          channel: input.channel.trim().toLowerCase().slice(0, 60),
          amount: input.amount,
          created_by: u.user?.id ?? null,
        },
        { onConflict: "account_id,month,channel" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report", accountId] }),
  });
}

export function useDeleteAdSpend(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ad_spend").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report", accountId] }),
  });
}
