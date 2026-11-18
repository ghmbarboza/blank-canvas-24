import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { callApi } from "@/lib/api";
import { errorMessage, FunctionError } from "@/lib/functions";
import { inboxKeys } from "./keys";
import type { CalendarEvent, Contact, ContactIdentity, DealWithStages } from "./types";

export function useContact(accountId: string, contactId: string | null) {
  return useQuery({
    queryKey: inboxKeys.contact(accountId, contactId ?? "none"),
    enabled: Boolean(contactId),
    queryFn: async (): Promise<Contact | null> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", contactId ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useContactIdentities(accountId: string, contactId: string) {
  return useQuery({
    queryKey: inboxKeys.identities(accountId, contactId),
    queryFn: async (): Promise<ContactIdentity[]> => {
      const { data, error } = await supabase
        .from("contact_identities")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useClassifyContact(accountId: string, contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      callApi<{ score: number }>("/api/ai", { accountId, action: "classify", contactId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inboxKeys.contact(accountId, contactId) }),
        queryClient.invalidateQueries({ queryKey: inboxKeys.conversations(accountId) }),
      ]);
      toast.success("Resumo do cliente atualizado");
    },
    onError: (err) => {
      const noHistory = err instanceof FunctionError && err.code === "no_history";
      toast.error(
        noHistory ? "Ainda não há conversa suficiente para classificar." : errorMessage(err),
      );
    },
  });
}

export function useContactDeals(accountId: string, contactId: string) {
  return useQuery({
    queryKey: inboxKeys.contactDeals(accountId, contactId),
    queryFn: async (): Promise<DealWithStages[]> => {
      const { data: deals, error } = await supabase
        .from("deals")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const pipelineIds = [...new Set((deals ?? []).map((d) => d.pipeline_id))];
      const { data: stages, error: sErr } = pipelineIds.length
        ? await supabase
            .from("pipeline_stages")
            .select("*")
            .eq("account_id", accountId)
            .in("pipeline_id", pipelineIds)
            .order("position")
        : { data: [], error: null };
      if (sErr) throw sErr;
      return (deals ?? []).map((deal) => ({
        deal,
        stages: (stages ?? []).filter((s) => s.pipeline_id === deal.pipeline_id),
      }));
    },
  });
}

interface NewDeal {
  title: string;
  value: number;
}

// Cartão novo entra na jornada padrão da carteira, na primeira etapa aberta.
export function useCreateDeal(accountId: string, contactId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ title, value }: NewDeal) => {
      const { data: pipelines, error: pErr } = await supabase
        .from("pipelines")
        .select("id, is_default, position")
        .eq("account_id", accountId)
        .order("is_default", { ascending: false })
        .order("position")
        .limit(1);
      if (pErr) throw pErr;
      const pipeline = pipelines?.[0];
      if (!pipeline)
        throw new Error(
          "Nenhuma jornada criada. Abra a Carteira e crie a jornada do cliente primeiro.",
        );
      const { data: stage, error: sErr } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("account_id", accountId)
        .eq("pipeline_id", pipeline.id)
        .eq("kind", "open")
        .order("position")
        .limit(1)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!stage) throw new Error("A jornada padrão não tem etapa aberta.");
      const { error } = await supabase.from("deals").insert({
        account_id: accountId,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        contact_id: contactId,
        title,
        value,
        owner_user_id: user?.id ?? null,
        source: "inbox",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["deals", accountId] });
      toast.success("Cliente colocado na carteira");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useContactEvents(accountId: string, contactId: string) {
  return useQuery({
    queryKey: inboxKeys.contactEvents(accountId, contactId),
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .gte("ends_at", new Date().toISOString())
        .neq("status", "canceled")
        .order("starts_at")
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface NewEvent {
  title: string;
  startsAt: Date;
  durationMinutes: number;
}

export function useCreateEvent(accountId: string, contactId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ title, startsAt, durationMinutes }: NewEvent) => {
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      const { error } = await supabase.from("events").insert({
        account_id: accountId,
        title,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        contact_id: contactId,
        owner_user_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events", accountId] });
      toast.success("Evento agendado");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export interface HistoryRow {
  kind: string;
  ref_id: string;
  at: string;
  title: string;
}

const HISTORY_SCAN = 40;

// Histórico recente do contato: a linha do tempo 360 (RPC contact_timeline) sem as mensagens,
// que já estão na conversa ao lado. Fica o que mudou: negócio, reunião, ligação, chamado, leitura da IA.
export function useRecentHistory(accountId: string, contactId: string, limit = 4) {
  return useQuery({
    queryKey: inboxKeys.recentHistory(accountId, contactId),
    staleTime: 60_000,
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase.rpc("contact_timeline", {
        _contact: contactId,
        _limit: HISTORY_SCAN,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as HistoryRow[];
      return rows.filter((r) => r.kind !== "message").slice(0, limit);
    },
  });
}
