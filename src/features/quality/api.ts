import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import type { EvaluationItem, QualityChannel, QualityCriterion } from "./scoring";

export type QualityForm = Omit<Tables<"quality_forms">, "criteria" | "channels"> & {
  criteria: QualityCriterion[];
  channels: QualityChannel[];
};
export type QualityEvaluation = Omit<Tables<"quality_evaluations">, "items"> & {
  items: EvaluationItem[];
};
export type QualityDispute = Tables<"quality_disputes">;
export type QualityCalibration = Tables<"quality_calibrations">;
export type QualitySettings = Tables<"quality_settings">;

export interface QualityOverview {
  evaluated: number;
  avg_score: number | null;
  eliminated: number;
  errors: number;
  skipped: number;
  cost_usd: number;
  by_channel: Record<string, { n: number; avg: number | null }>;
  by_agent: {
    user_id: string | null;
    is_ai: boolean;
    n: number;
    avg: number | null;
    eliminated: number;
  }[];
  weak: { criterion_id: string; label: string; fails: number; avg: number | null; n: number }[];
  agreement: number | null;
  calibrations: number;
  disputes_open: number;
}

export const qualityKeys = {
  all: (a: string) => ["quality", a] as const,
  settings: (a: string) => ["quality", a, "settings"] as const,
  forms: (a: string) => ["quality", a, "forms"] as const,
  overview: (a: string, d: number) => ["quality", a, "overview", d] as const,
  evaluations: (a: string, f: EvaluationFilters) => ["quality", a, "evaluations", f] as const,
  evaluation: (a: string, id: string) => ["quality", a, "evaluation", id] as const,
  disputes: (a: string) => ["quality", a, "disputes"] as const,
  calibrations: (a: string) => ["quality", a, "calibrations"] as const,
  spend: (a: string) => ["quality", a, "spend"] as const,
};

export function useQualitySettings(accountId: string) {
  return useQuery({
    queryKey: qualityKeys.settings(accountId),
    queryFn: async (): Promise<QualitySettings | null> => {
      const { data, error } = await supabase
        .from("quality_settings")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useQualitySpend(accountId: string) {
  return useQuery({
    queryKey: qualityKeys.spend(accountId),
    queryFn: async (): Promise<{ month_usd: number; today: number }> => {
      const { data, error } = await supabase.rpc("quality_spend", { _account: accountId });
      if (error) throw error;
      const d = (data ?? {}) as { month_usd?: number; today?: number };
      return { month_usd: Number(d.month_usd ?? 0), today: Number(d.today ?? 0) };
    },
  });
}

export function useQualityForms(accountId: string) {
  return useQuery({
    queryKey: qualityKeys.forms(accountId),
    queryFn: async (): Promise<QualityForm[]> => {
      const { data, error } = await supabase
        .from("quality_forms")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as QualityForm[];
    },
  });
}

export function useQualityOverview(accountId: string, days: number) {
  return useQuery({
    queryKey: qualityKeys.overview(accountId, days),
    queryFn: async (): Promise<QualityOverview> => {
      const { data, error } = await supabase.rpc("quality_overview", {
        _account: accountId,
        _days: days,
      });
      if (error) throw error;
      return data as unknown as QualityOverview;
    },
  });
}

export interface EvaluationFilters {
  channel: QualityChannel | "all";
  agent: string | "all" | "ai";
  status: "done" | "problem" | "eliminated";
  days: number;
}

export function useEvaluations(accountId: string, f: EvaluationFilters) {
  return useQuery({
    queryKey: qualityKeys.evaluations(accountId, f),
    queryFn: async (): Promise<QualityEvaluation[]> => {
      let q = supabase
        .from("quality_evaluations")
        .select("*")
        .eq("account_id", accountId)
        .gte("created_at", new Date(Date.now() - f.days * 86_400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(200);
      if (f.channel !== "all") q = q.eq("channel", f.channel);
      if (f.agent === "ai") q = q.eq("is_ai", true);
      else if (f.agent !== "all") q = q.eq("agent_user_id", f.agent);
      if (f.status === "done") q = q.eq("status", "done");
      if (f.status === "eliminated") q = q.eq("status", "done").eq("eliminated", true);
      if (f.status === "problem") q = q.in("status", ["error", "skipped"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as QualityEvaluation[];
    },
  });
}

export function useEvaluation(accountId: string, id: string | null) {
  return useQuery({
    queryKey: qualityKeys.evaluation(accountId, id ?? "none"),
    enabled: Boolean(id),
    queryFn: async (): Promise<QualityEvaluation | null> => {
      const { data, error } = await supabase
        .from("quality_evaluations")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as QualityEvaluation | null;
    },
  });
}

export function useEvaluationsByIds(accountId: string, ids: string[]) {
  return useQuery({
    queryKey: ["quality", accountId, "by-ids", ids] as const,
    enabled: ids.length > 0,
    queryFn: async (): Promise<QualityEvaluation[]> => {
      const { data, error } = await supabase
        .from("quality_evaluations")
        .select("*")
        .eq("account_id", accountId)
        .in("id", ids);
      if (error) throw error;
      const byId = new Map((data ?? []).map((e) => [e.id, e]));
      return ids.map((i) => byId.get(i)).filter(Boolean) as unknown as QualityEvaluation[];
    },
  });
}

export function useDisputes(accountId: string) {
  return useQuery({
    queryKey: qualityKeys.disputes(accountId),
    queryFn: async (): Promise<QualityDispute[]> => {
      const { data, error } = await supabase
        .from("quality_disputes")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCalibrations(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: qualityKeys.calibrations(accountId),
    enabled,
    queryFn: async (): Promise<QualityCalibration[]> => {
      const { data, error } = await supabase
        .from("quality_calibrations")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Ações do servidor (/api/quality). Invalida tudo da qualidade ao terminar. */
export function useQualityAction<T = unknown>(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown> & { action: string }) =>
      callApi<T>("/api/quality", { accountId, ...body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qualityKeys.all(accountId) }),
  });
}

export interface EvaluateResult {
  status: "done" | "error" | "skipped";
  evaluationId: string | null;
  score?: number;
  reason?: string;
}

const PAGE = 1000; // o PostgREST corta em 1.000 linhas sem avisar: paginamos
const MAX_PAGES = 20;

/** Notas do período (só a nota e se foi eliminada), paginadas, para a distribuição por faixa. */
export function useScoreSample(accountId: string, days: number) {
  return useQuery({
    queryKey: ["quality", accountId, "score-sample", days] as const,
    queryFn: async (): Promise<{ score: number | null; eliminated: boolean }[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const out: { score: number | null; eliminated: boolean }[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from("quality_evaluations")
          .select("score, eliminated")
          .eq("account_id", accountId)
          .eq("status", "done")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        out.push(...(data ?? []));
        if ((data ?? []).length < PAGE) break;
      }
      return out;
    },
  });
}

/** Nome dos contatos das avaliações exibidas. */
export function useContactNames(accountId: string, ids: string[]) {
  return useQuery({
    queryKey: ["quality", accountId, "contact-names", ids] as const,
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name")
        .eq("account_id", accountId)
        .in("id", ids);
      if (error) throw error;
      return new Map((data ?? []).map((c) => [c.id, c.name ?? "Sem nome"]));
    },
  });
}
