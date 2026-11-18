import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import type { CriterionScore, RoleplayMessage } from "./roleplay";

export type Persona = Tables<"roleplay_personas">;
export type SessionRow = Tables<"roleplay_sessions">;
export interface Session extends Omit<SessionRow, "messages" | "criteria"> {
  messages: RoleplayMessage[];
  criteria: CriterionScore[];
}

export const trainingKeys = {
  personas: (a: string) => ["roleplay-personas", a] as const,
  sessions: (a: string) => ["roleplay-sessions", a] as const,
  session: (id: string) => ["roleplay-session", id] as const,
  ranking: (a: string) => ["roleplay-ranking", a] as const,
};

function toSession(row: SessionRow): Session {
  return {
    ...row,
    messages: Array.isArray(row.messages) ? (row.messages as unknown as RoleplayMessage[]) : [],
    criteria: Array.isArray(row.criteria) ? (row.criteria as unknown as CriterionScore[]) : [],
  };
}

export function usePersonas(accountId: string) {
  return useQuery({
    queryKey: trainingKeys.personas(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roleplay_personas")
        .select("*")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSessions(accountId: string) {
  return useQuery({
    queryKey: trainingKeys.sessions(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roleplay_sessions")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map(toSession);
    },
  });
}

export function useRanking(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: trainingKeys.ranking(accountId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("roleplay_ranking", {
        _account: accountId,
        _days: 30,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSeedPersonas(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      callApi<{ created: number }>("/api/coach/roleplay", { accountId, action: "seed" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.personas(accountId) }),
  });
}

export function useSavePersona(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<TablesInsert<"roleplay_personas">, "account_id"> & { id?: string },
    ) => {
      const { id, ...values } = input;
      if (id) {
        const { error } = await supabase.from("roleplay_personas").update(values).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("roleplay_personas")
        .insert({ ...values, account_id: accountId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: trainingKeys.personas(accountId) }),
  });
}

export function useRoleplayAction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { action: "start"; personaId: string; playbookId: string | null }
        | { action: "reply"; sessionId: string; text: string }
        | { action: "finish"; sessionId: string },
    ) => toSession(await callApi<SessionRow>("/api/coach/roleplay", { accountId, ...input })),
    onSuccess: (s) => {
      qc.setQueryData(trainingKeys.session(s.id), s);
      void qc.invalidateQueries({ queryKey: trainingKeys.sessions(accountId) });
      if (s.status === "finished")
        void qc.invalidateQueries({ queryKey: trainingKeys.ranking(accountId) });
    },
  });
}
