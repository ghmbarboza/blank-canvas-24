import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import type { ForecastCategory } from "./forecast-suggestion";

// Negócio como sala: sinais (deal_room), participantes do cliente e sugestão de forecast da IA.
export interface DealRoom {
  last_touch_at: string | null;
  next_activity_at: string | null;
  overdue_activities: number;
  proposal: {
    status: string;
    sent_at: string | null;
    first_viewed_at: string | null;
    view_count: number;
    accepted_at: string | null;
  } | null;
  contact: {
    id: string;
    name: string | null;
    score: number | null;
    temperature: string | null;
    ai_intent: string | null;
    ai_summary: string | null;
    ai_next_step: string | null;
    classified_at: string | null;
  } | null;
  last_minutes: {
    meeting_id: string;
    title: string;
    at: string | null;
    summary: string | null;
    risks: string[];
    next_steps: { title: string; owner: string; due_in_days?: number }[];
    objections: { objection: string; handled: boolean }[];
    score: number | null;
  } | null;
  last_call: { call_id: string; at: string; summary: string; sentiment: string | null } | null;
  meetings: {
    id: string;
    title: string;
    status: string;
    at: string | null;
    score: number | null;
  }[];
  calls: {
    id: string;
    direction: string;
    status: string;
    at: string;
    seconds: number | null;
    summary: string | null;
  }[];
}

export const DEAL_ROLES = ["decisor", "influenciador", "usuario", "outro"] as const;
export type DealRole = (typeof DEAL_ROLES)[number];
export const DEAL_ROLE_LABEL: Record<DealRole, string> = {
  decisor: "Decisor",
  influenciador: "Influenciador",
  usuario: "Usuário",
  outro: "Outro",
};

export interface DealParticipant {
  id: string;
  role: DealRole;
  contact: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    job_title: string | null;
    email: string | null;
  } | null;
}

export interface ForecastSuggestionRow {
  id: string;
  current_category: ForecastCategory;
  suggested_category: ForecastCategory;
  reasons: string[];
  meeting_id: string | null;
  created_at: string;
}

const roomKey = (dealId: string) => ["deal-room", dealId];

export function useDealRoom(dealId: string) {
  return useQuery({
    queryKey: roomKey(dealId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("deal_room", { _deal: dealId });
      if (error) throw error;
      return (data ?? null) as unknown as DealRoom | null;
    },
  });
}

export function useDealParticipants(dealId: string) {
  return useQuery({
    queryKey: ["deal-participants", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_contacts")
        .select("id, role, contact:contacts(id, name, avatar_url, job_title, email)")
        .eq("deal_id", dealId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as DealParticipant[];
    },
  });
}

function useInvalidateRoom(dealId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["deal-participants", dealId] });
    void qc.invalidateQueries({ queryKey: roomKey(dealId) });
  };
}

export function useAddParticipant(accountId: string, dealId: string) {
  const done = useInvalidateRoom(dealId);
  return useMutation({
    mutationFn: async ({ contactId, role }: { contactId: string; role: DealRole }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("deal_contacts").insert({
        account_id: accountId,
        deal_id: dealId,
        contact_id: contactId,
        role,
        created_by: u.user?.id ?? null,
      });
      if (error?.code === "23505") throw new Error("Essa pessoa já participa do negócio");
      if (error) throw error;
    },
    onSuccess: done,
  });
}

export function useSetParticipantRole(dealId: string) {
  const done = useInvalidateRoom(dealId);
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: DealRole }) => {
      const { error } = await supabase.from("deal_contacts").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

export function useRemoveParticipant(dealId: string) {
  const done = useInvalidateRoom(dealId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deal_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
}

export function useForecastSuggestion(dealId: string) {
  return useQuery({
    queryKey: ["forecast-suggestion", dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_forecast_suggestions")
        .select("id, current_category, suggested_category, reasons, meeting_id, created_at")
        .eq("deal_id", dealId)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ForecastSuggestionRow | null;
    },
  });
}

export function useDecideSuggestion(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "applied" | "ignored" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("deal_forecast_suggestions")
        .update({ status, decided_by: u.user?.id ?? null, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecast-suggestion", dealId] }),
  });
}
