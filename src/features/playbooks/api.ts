import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import { parsePlaybook, type PlaybookContent, type ScorecardCriterion } from "./types";

export type PlaybookRow = Tables<"playbooks">;
export type ScorecardRow = Tables<"scorecard_templates">;

export const playbookKeys = {
  all: (accountId: string) => ["playbooks", accountId] as const,
  scorecards: (accountId: string) => ["scorecards", accountId] as const,
};

export function usePlaybooks(accountId: string) {
  return useQuery({
    queryKey: playbookKeys.all(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playbooks")
        .select("*")
        .eq("account_id", accountId)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        row: r,
        content: parsePlaybook(r as unknown as Record<string, unknown>),
      }));
    },
  });
}

export interface PlaybookMeta {
  pipeline_id: string | null;
  stage_id: string | null;
  scorecard_id: string | null;
  is_default: boolean;
  is_active: boolean;
}

export function useSavePlaybook(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; content: PlaybookContent; meta: PlaybookMeta }) => {
      const values = {
        name: input.content.name.trim() || "Playbook",
        description: input.content.description ?? null,
        framework: input.content.framework,
        phases: input.content.phases as never,
        questions: input.content.questions as never,
        objections: input.content.objections as never,
        competitors: input.content.competitors as never,
        closing_signals: input.content.closing_signals as never,
        forbidden_phrases: input.content.forbidden_phrases as never,
        ...input.meta,
      };
      if (input.meta.is_default)
        await supabase
          .from("playbooks")
          .update({ is_default: false })
          .eq("account_id", accountId)
          .neq("id", input.id ?? "00000000-0000-0000-0000-000000000000");
      if (input.id) {
        const { error } = await supabase.from("playbooks").update(values).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("playbooks")
        .insert({ ...values, account_id: accountId, created_by: u.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: playbookKeys.all(accountId) }),
  });
}

export function useDeletePlaybook(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("playbooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: playbookKeys.all(accountId) }),
  });
}

export function parseCriteria(v: unknown): ScorecardCriterion[] {
  return Array.isArray(v)
    ? (v as ScorecardCriterion[]).map((c, i) => ({
        id: String(c?.id ?? `c${i}`),
        label: String(c?.label ?? ""),
        description: c?.description ? String(c.description) : "",
        weight: Number(c?.weight ?? 1) || 1,
      }))
    : [];
}

export function useScorecards(accountId: string) {
  return useQuery({
    queryKey: playbookKeys.scorecards(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scorecard_templates")
        .select("*")
        .eq("account_id", accountId)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveScorecard(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      criteria: ScorecardCriterion[];
      is_default: boolean;
    }) => {
      if (input.is_default)
        await supabase
          .from("scorecard_templates")
          .update({ is_default: false })
          .eq("account_id", accountId);
      if (input.id) {
        const { error } = await supabase
          .from("scorecard_templates")
          .update({
            name: input.name,
            criteria: input.criteria as never,
            is_default: input.is_default,
          })
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("scorecard_templates")
        .insert({
          account_id: accountId,
          name: input.name,
          criteria: input.criteria as never,
          is_default: input.is_default,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: playbookKeys.scorecards(accountId) }),
  });
}

export function useDeleteScorecard(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scorecard_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: playbookKeys.scorecards(accountId) }),
  });
}
