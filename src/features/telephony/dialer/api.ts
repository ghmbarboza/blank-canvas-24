import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { applySegment } from "@/features/segments/rules";
import type { SegmentFilter } from "@/features/segments/rules";

export type DialerSession = Tables<"dialer_sessions">;
export type DialerMode = "preview" | "power";
export type Outcome =
  "talked" | "no_answer" | "voicemail" | "callback" | "not_interested" | "skipped";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  talked: "Conversou",
  no_answer: "Não atendeu",
  voicemail: "Caixa postal",
  callback: "Retornar depois",
  not_interested: "Sem interesse",
  skipped: "Pulou",
};

export type DialerStats = Partial<Record<Outcome, number>>;

export interface DialerContact {
  id: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  score: number | null;
  temperature: string | null;
  ai_intent: string | null;
  ai_summary: string | null;
  ai_next_step: string | null;
  last_interaction_at: string | null;
}

const MAX_CONTACTS = 500;
const keys = {
  sessions: (accountId: string) => ["dialer-sessions", accountId] as const,
  contacts: (ids: string[]) => ["dialer-contacts", ids] as const,
};

export function useDialerSessions(accountId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.sessions(accountId),
    enabled: Boolean(user),
    queryFn: async (): Promise<DialerSession[]> => {
      const { data, error } = await supabase
        .from("dialer_sessions")
        .select("*")
        .eq("account_id", accountId)
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Cria a fila a partir de um segmento: só contatos com telefone, os mais quentes primeiro. */
export function useCreateDialerSession(accountId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      mode: DialerMode;
      segmentId: string | null;
      filter: SegmentFilter | null;
    }): Promise<DialerSession> => {
      const q = applySegment(
        supabase
          .from("contacts")
          .select("id")
          .eq("account_id", accountId)
          .not("phone", "is", null)
          .neq("phone", ""),
        input.filter,
      )
        .order("score", { ascending: false, nullsFirst: false })
        .limit(MAX_CONTACTS);
      const { data: rows, error: qErr } = await q;
      if (qErr) throw qErr;
      const ids = (rows ?? []).map((r) => r.id);
      if (!ids.length) throw new Error("Nenhum contato com telefone neste segmento");
      const { data, error } = await supabase
        .from("dialer_sessions")
        .insert({
          account_id: accountId,
          user_id: user!.id,
          mode: input.mode,
          name: input.name.trim() || "Sessão de ligações",
          segment_id: input.segmentId,
          contact_ids: ids,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.sessions(accountId) }),
  });
}

export function useUpdateDialerSession(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<DialerSession, "position" | "status" | "stats" | "mode">>;
    }) => {
      const { error } = await supabase
        .from("dialer_sessions")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.sessions(accountId) }),
  });
}

/** O contato da vez e os próximos (para a fila lateral). */
export function useDialerContacts(ids: string[]) {
  return useQuery({
    queryKey: keys.contacts(ids),
    enabled: ids.length > 0,
    queryFn: async (): Promise<DialerContact[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          "id, name, phone, company, score, temperature, ai_intent, ai_summary, ai_next_step, last_interaction_at",
        )
        .in("id", ids);
      if (error) throw error;
      const byId = new Map((data ?? []).map((c) => [c.id, c as DialerContact]));
      return ids.map((id) => byId.get(id)).filter((c): c is DialerContact => Boolean(c));
    },
  });
}

/** Registra o resultado na ligação mais recente do vendedor com esse contato (últimos 30 min). */
export async function saveOutcome(
  accountId: string,
  userId: string,
  contactId: string,
  outcome: Outcome,
  note: string,
) {
  if (outcome === "skipped") return;
  const { data: call } = await supabase
    .from("calls")
    .select("id")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .gte("started_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (call)
    await supabase
      .from("calls")
      .update({ disposition: outcome, disposition_reason: note.trim() || null })
      .eq("id", call.id);
  if (outcome === "callback")
    await supabase.from("activities").insert({
      account_id: accountId,
      contact_id: contactId,
      user_id: userId,
      type: "task",
      title: "Retornar a ligação",
      body: note.trim() || null,
      due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    });
}
