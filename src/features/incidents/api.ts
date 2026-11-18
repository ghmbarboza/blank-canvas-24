import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TicketGroup } from "@/features/support/incident-grouping";
import { callApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type Incident = Tables<"incidents">;
export type IncidentUpdate = Tables<"incident_updates">;
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: "Investigando",
  identified: "Causa encontrada",
  monitoring: "Corrigido, em observação",
  resolved: "Resolvido",
};
export const IMPACT_LABEL: Record<string, string> = {
  minor: "Pequeno",
  major: "Grande",
  critical: "Crítico",
};

export interface IncidentRow extends Incident {
  updates: IncidentUpdate[];
  tickets: { id: string; number: number; subject: string; status: string }[];
}

const keys = {
  all: (a: string) => ["incidents", a] as const,
  suggest: (a: string) => ["incidents", a, "suggest"] as const,
};

export function useIncidents(accountId: string) {
  return useQuery({
    queryKey: keys.all(accountId),
    queryFn: async (): Promise<IncidentRow[]> => {
      const { data, error } = await supabase
        .from("incidents")
        .select("*, updates:incident_updates(*), tickets(id, number, subject, status)")
        .eq("account_id", accountId)
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as unknown as IncidentRow[]).map((i) => ({
        ...i,
        updates: [...(i.updates ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }));
    },
  });
}

export function useIncidentSuggestions(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.suggest(accountId),
    enabled,
    queryFn: () =>
      callApi<{ groups: TicketGroup[] }>("/api/sac", { accountId, action: "incident.suggest" }),
  });
}

export function useCreateIncident(accountId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: {
      title: string;
      impact: string;
      isPublic: boolean;
      summary: string;
      ticketIds: string[];
    }) => {
      const { data, error } = await supabase
        .from("incidents")
        .insert({
          account_id: accountId,
          title: p.title.trim(),
          impact: p.impact,
          is_public: p.isPublic,
          public_summary: p.summary.trim() || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (p.ticketIds.length)
        await callApi("/api/sac", {
          accountId,
          action: "incident.link",
          incidentId: data.id,
          ticketIds: p.ticketIds,
        });
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(accountId) }),
  });
}

export function usePostIncidentUpdate(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      incidentId: string;
      status: IncidentStatus;
      body: string;
      notify: boolean;
      resolveTickets: boolean;
    }) =>
      callApi<{ notified: number; failed: number }>("/api/sac", {
        accountId,
        action: "incident.update",
        ...p,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(accountId) }),
  });
}

export function useToggleIncidentPublic(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; isPublic: boolean }) => {
      const { error } = await supabase
        .from("incidents")
        .update({ is_public: p.isPublic })
        .eq("id", p.id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all(accountId) }),
  });
}
