import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import type { Factor } from "./model";
import type { RoutingMatch } from "./routing";

export type LeadScoreModel = Tables<"lead_score_models">;
export type RoutingRuleRow = Omit<Tables<"lead_routing_rules">, "match"> & { match: RoutingMatch };

export interface ScoredLead {
  contact_id: string;
  score: number | null;
  factors: Factor[];
  best_hour: number | null;
  best_dow: number | null;
  reply_samples: number;
  contact: {
    id: string;
    name: string | null;
    email: string | null;
    owner_user_id: string | null;
    lifecycle: string;
  } | null;
}

const keys = {
  all: (a: string) => ["sdr", a] as const,
  model: (a: string) => ["sdr", a, "model"] as const,
  leads: (a: string) => ["sdr", a, "leads"] as const,
  rules: (a: string) => ["sdr", a, "rules"] as const,
  contact: (a: string, c: string) => ["sdr", a, "contact", c] as const,
};

export function useLeadModel(accountId: string) {
  return useQuery({
    queryKey: keys.model(accountId),
    queryFn: async (): Promise<LeadScoreModel | null> => {
      const { data, error } = await supabase
        .from("lead_score_models")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Leads ainda abertos (sem cliente fechado) com a maior nota primeiro. */
export function useScoredLeads(accountId: string) {
  return useQuery({
    queryKey: keys.leads(accountId),
    queryFn: async (): Promise<ScoredLead[]> => {
      const { data, error } = await supabase
        .from("lead_scores")
        .select(
          "contact_id, score, factors, best_hour, best_dow, reply_samples, contact:contacts(id, name, email, owner_user_id, lifecycle)",
        )
        .eq("account_id", accountId)
        .not("score", "is", null)
        .order("score", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as unknown as ScoredLead[]).filter(
        (l) => l.contact && l.contact.lifecycle !== "customer",
      );
    },
  });
}

export function useContactLeadScore(accountId: string, contactId: string) {
  return useQuery({
    queryKey: keys.contact(accountId, contactId),
    queryFn: async (): Promise<Omit<ScoredLead, "contact"> | null> => {
      const { data, error } = await supabase
        .from("lead_scores")
        .select("contact_id, score, factors, best_hour, best_dow, reply_samples")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Omit<ScoredLead, "contact"> | null;
    },
  });
}

export interface TrainSummary {
  trained: boolean;
  reason: string;
  samples: number;
  accuracy: number | null;
  scored: number;
  hours: number;
}

export function useTrainModel(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callApi<TrainSummary>("/api/sdr", { accountId, action: "train" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(accountId) }),
  });
}

export function useRoutingRules(accountId: string) {
  return useQuery({
    queryKey: keys.rules(accountId),
    queryFn: async (): Promise<RoutingRuleRow[]> => {
      const { data, error } = await supabase
        .from("lead_routing_rules")
        .select("*")
        .eq("account_id", accountId)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as RoutingRuleRow[];
    },
  });
}

export interface RuleDraft {
  id?: string | undefined;
  name: string;
  match: RoutingMatch;
  mode: "user" | "round_robin";
  user_ids: string[];
  is_active: boolean;
  position: number;
}

export function useSaveRule(accountId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (r: RuleDraft) => {
      const values = {
        name: r.name.trim(),
        match: r.match as never,
        mode: r.mode,
        user_ids: r.user_ids,
        is_active: r.is_active,
        position: r.position,
      };
      const { error } = r.id
        ? await supabase
            .from("lead_routing_rules")
            .update(values)
            .eq("id", r.id)
            .eq("account_id", accountId)
        : await supabase
            .from("lead_routing_rules")
            .insert({ ...values, account_id: accountId, created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules(accountId) }),
  });
}

export function useDeleteRule(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lead_routing_rules")
        .delete()
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules(accountId) }),
  });
}

export interface SimulateResult {
  userId: string | null;
  ruleName: string | null;
  bookingSlug: string | null;
}

export function useSimulateRoute(accountId: string) {
  return useMutation({
    mutationFn: (lead: {
      state: string;
      city: string;
      segment: string;
      source: string;
      size: string;
    }) => callApi<SimulateResult>("/api/sdr", { accountId, action: "simulate", ...lead }),
  });
}
