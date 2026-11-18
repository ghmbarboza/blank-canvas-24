import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type Ticket = Tables<"tickets">;
export type TicketEvent = Tables<"ticket_events">;
export type KbArticle = Tables<"kb_articles">;
export type QuickReply = Tables<"quick_replies">;
export type SlaPolicy = Tables<"sla_policies">;
export type SlaPlanRule = Tables<"sla_plan_rules">;
export type NpsSurvey = Tables<"nps_surveys">;
export type EvalCase = Tables<"ai_eval_cases">;

export interface TicketRow extends Ticket {
  contact: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  /** Canal de origem quando o chamado nasceu de uma conversa (ícone da rede no cartão). */
  conversation: { channel: { platform: string | null } | null } | null;
}

export const supportKeys = {
  tickets: (a: string) => ["support", a, "tickets"] as const,
  ticket: (a: string, id: string) => ["support", a, "ticket", id] as const,
  events: (a: string, id: string) => ["support", a, "events", id] as const,
  kb: (a: string) => ["support", a, "kb"] as const,
  replies: (a: string) => ["support", a, "quick-replies"] as const,
  sla: (a: string) => ["support", a, "sla"] as const,
  slaPlans: (a: string) => ["support", a, "sla-plans"] as const,
  nps: (a: string) => ["support", a, "nps"] as const,
  metrics: (a: string, d: number) => ["support", a, "metrics", d] as const,
  evals: (a: string) => ["support", a, "evals"] as const,
  agentRuns: (a: string) => ["support", a, "agent-runs"] as const,
};

const TICKET_COLUMNS =
  "*, contact:contacts(id, name, email, phone), conversation:conversations(channel:channels(platform))";

export function useTickets(accountId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: supportKeys.tickets(accountId),
    queryFn: async (): Promise<TicketRow[]> => {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as TicketRow[];
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`tickets-${accountId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets", filter: `account_id=eq.${accountId}` },
        () => {
          void qc.invalidateQueries({ queryKey: supportKeys.tickets(accountId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [accountId, qc]);
  return q;
}

export function useTicket(accountId: string, id: string | null) {
  return useQuery({
    queryKey: supportKeys.ticket(accountId, id ?? ""),
    enabled: Boolean(id),
    queryFn: async (): Promise<TicketRow | null> => {
      const { data, error } = await supabase
        .from("tickets")
        .select(TICKET_COLUMNS)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as TicketRow | null;
    },
  });
}

export function useTicketEvents(accountId: string, id: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: supportKeys.events(accountId, id ?? ""),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_events")
        .select("*")
        .eq("ticket_id", id!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`ticket-events-${id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_events", filter: `ticket_id=eq.${id}` },
        () => {
          void qc.invalidateQueries({ queryKey: supportKeys.events(accountId, id) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [accountId, id, qc]);
  return q;
}

export function useCreateTicket(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      subject: string;
      description?: string | null;
      contactId?: string | null;
      conversationId?: string | null;
      priority?: string;
      source?: string;
      category?: string | null;
      ownerUserId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("create_ticket", {
        _account: accountId,
        _subject: input.subject,
        ...(input.description ? { _description: input.description } : {}),
        ...(input.contactId ? { _contact: input.contactId } : {}),
        ...(input.conversationId ? { _conversation: input.conversationId } : {}),
        _priority: input.priority ?? "normal",
        _source: input.source ?? "manual",
        ...(input.category ? { _category: input.category } : {}),
        ...(input.ownerUserId ? { _owner: input.ownerUserId } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.tickets(accountId) }),
  });
}

export function useUpdateTicket(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"tickets"> }) => {
      const { error } = await supabase.from("tickets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: supportKeys.tickets(accountId) });
      const prev = qc.getQueryData<TicketRow[]>(supportKeys.tickets(accountId));
      qc.setQueryData<TicketRow[]>(supportKeys.tickets(accountId), (list) =>
        list?.map((t) => (t.id === id ? { ...t, ...(patch as Partial<TicketRow>) } : t)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) =>
      ctx?.prev && qc.setQueryData(supportKeys.tickets(accountId), ctx.prev),
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: supportKeys.tickets(accountId) });
      void qc.invalidateQueries({ queryKey: supportKeys.ticket(accountId, v.id) });
      void qc.invalidateQueries({ queryKey: supportKeys.events(accountId, v.id) });
    },
  });
}

export function useAddTicketComment(accountId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      ticketId,
      body,
      isPublic,
    }: {
      ticketId: string;
      body: string;
      isPublic: boolean;
    }) => {
      if (!user) throw new Error("Sessão expirada");
      const { error } = await supabase.from("ticket_events").insert({
        account_id: accountId,
        ticket_id: ticketId,
        kind: "comment",
        body,
        is_public: isPublic,
        author_user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: supportKeys.events(accountId, v.ticketId) });
      void qc.invalidateQueries({ queryKey: supportKeys.tickets(accountId) });
    },
  });
}

const metricsSchema = z.object({
  open: z.number(),
  created: z.number(),
  resolved: z.number(),
  breached_open: z.number(),
  first_response_minutes_avg: z.number().nullable(),
  resolution_hours_avg: z.number().nullable(),
  sla_met_pct: z.number().nullable(),
  csat_avg: z.number().nullable(),
  csat_responses: z.number(),
  csat_sent: z.number(),
  nps: z.number().nullable(),
  nps_responses: z.number(),
  ai_replied: z.number(),
  ai_handoff: z.number(),
  by_status: z.record(z.string(), z.number()),
  by_priority: z.record(z.string(), z.number()),
});
export type SacMetrics = z.infer<typeof metricsSchema>;

export function useSacMetrics(accountId: string, days = 30) {
  return useQuery({
    queryKey: supportKeys.metrics(accountId, days),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sac_metrics", {
        _account: accountId,
        _days: days,
      });
      if (error) throw error;
      return metricsSchema.parse(data);
    },
  });
}

// ---------------------------------------------------------------- base de conhecimento

export function useKbArticles(accountId: string) {
  return useQuery({
    queryKey: supportKeys.kb(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kb_articles")
        .select(
          "id, account_id, title, slug, category, body_md, visibility, status, views, helpful_yes, helpful_no, embedded_at, updated_at, created_at, author_user_id, ai_suggested, source_ticket_id",
        )
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveArticle(accountId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      values: Omit<TablesInsert<"kb_articles">, "account_id">;
    }) => {
      const res = input.id
        ? await supabase
            .from("kb_articles")
            .update(input.values)
            .eq("id", input.id)
            .select("id")
            .single()
        : await supabase
            .from("kb_articles")
            .insert({ ...input.values, account_id: accountId, author_user_id: user?.id ?? null })
            .select("id")
            .single();
      if (res.error) throw res.error;
      // Reindexa para a busca semântica (só faz efeito com chave da OpenAI na conta).
      void callApi("/api/support", { accountId, action: "kb.embed", articleId: res.data.id }).catch(
        () => undefined,
      );
      return res.data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.kb(accountId) }),
  });
}

export function useDeleteArticle(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kb_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.kb(accountId) }),
  });
}

export function useAccountSlug(accountId: string) {
  return useQuery({
    queryKey: ["account-slug", accountId],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("slug").eq("id", accountId).single();
      return data?.slug ?? null;
    },
  });
}

// ---------------------------------------------------------------- respostas rápidas

export function useQuickReplies(accountId: string) {
  return useQuery({
    queryKey: supportKeys.replies(accountId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("*")
        .eq("account_id", accountId)
        .order("shortcut");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveQuickReply(accountId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      shortcut: string;
      title: string;
      body: string;
      is_shared: boolean;
      intents?: string[];
    }) => {
      const { id, ...values } = input;
      const res = id
        ? await supabase.from("quick_replies").update(values).eq("id", id)
        : await supabase
            .from("quick_replies")
            .insert({ ...values, account_id: accountId, created_by: user?.id ?? null });
      if (res.error) throw res.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.replies(accountId) }),
  });
}

export function useDeleteQuickReply(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.replies(accountId) }),
  });
}

// ---------------------------------------------------------------- SLA

export function useSlaPolicies(accountId: string) {
  return useQuery({
    queryKey: supportKeys.sla(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_policies")
        .select("*")
        .eq("account_id", accountId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveSlaPolicies(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: {
        priority: string;
        first_response_minutes: number;
        resolution_minutes: number;
        business_hours: boolean;
      }[],
    ) => {
      const { error } = await supabase.from("sla_policies").upsert(
        rows.map((r) => ({ ...r, account_id: accountId })),
        { onConflict: "account_id,priority" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.sla(accountId) }),
  });
}

// ---------------------------------------------------------------- pesquisas

export function useNpsSurveys(accountId: string) {
  return useQuery({
    queryKey: supportKeys.nps(accountId),
    queryFn: async () => {
      const [surveys, responses] = await Promise.all([
        supabase
          .from("nps_surveys")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase
          .from("nps_responses")
          .select("survey_id, score, answered_at")
          .eq("account_id", accountId)
          .not("answered_at", "is", null)
          .limit(5000),
      ]);
      if (surveys.error) throw surveys.error;
      return (surveys.data ?? []).map((s) => {
        const rs = (responses.data ?? []).filter((r) => r.survey_id === s.id && r.score !== null);
        const prom = rs.filter((r) => (r.score ?? 0) >= 9).length;
        const det = rs.filter((r) => (r.score ?? 0) <= 6).length;
        return {
          ...s,
          answered: rs.length,
          nps: rs.length ? Math.round((100 * (prom - det)) / rs.length) : null,
          promoters: prom,
          detractors: det,
        };
      });
    },
  });
}

export function useCsatResponses(accountId: string) {
  return useQuery({
    queryKey: ["support", accountId, "csat"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("csat_responses")
        .select("id, score, comment, answered_at, sent_at, ticket_id, contacts(name)")
        .eq("account_id", accountId)
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------- agente de IA

export function useEvalCases(accountId: string) {
  return useQuery({
    queryKey: supportKeys.evals(accountId),
    queryFn: async () => {
      const [cases, runs] = await Promise.all([
        supabase.from("ai_eval_cases").select("*").eq("account_id", accountId).order("created_at"),
        supabase
          .from("ai_eval_runs")
          .select("id, total, passed, accept_rate, created_at, results")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (cases.error) throw cases.error;
      return { cases: cases.data ?? [], runs: runs.data ?? [] };
    },
  });
}

export function useAgentRuns(accountId: string) {
  return useQuery({
    queryKey: supportKeys.agentRuns(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_runs")
        .select("id, conversation_id, status, reason, confidence, sources, latency_ms, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ───────────────────────── SLA por plano do cliente ─────────────────────────
export function useSlaPlanRules(accountId: string) {
  return useQuery({
    queryKey: supportKeys.slaPlans(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_plan_rules")
        .select("*")
        .eq("account_id", accountId)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveSlaPlanRule(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      values: Omit<TablesInsert<"sla_plan_rules">, "account_id">;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from("sla_plan_rules")
          .update(input.values as TablesUpdate<"sla_plan_rules">)
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("sla_plan_rules")
        .insert({ ...input.values, account_id: accountId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.slaPlans(accountId) }),
  });
}

export function useDeleteSlaPlanRule(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sla_plan_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: supportKeys.slaPlans(accountId) }),
  });
}

// ---------------------------------------------------------------- ficha do chamado

export interface ConversationTailItem {
  id: string;
  direction: string;
  sender_type: string;
  sender_name: string | null;
  type: string;
  body: string | null;
  transcript: string | null;
  created_at: string;
}

/** Últimas mensagens públicas da conversa ligada ao chamado (contexto, sem abrir a caixa de entrada). */
export function useConversationTail(accountId: string, conversationId: string | null, limit = 8) {
  return useQuery({
    queryKey: ["support", accountId, "conversation-tail", conversationId, limit],
    enabled: Boolean(conversationId),
    queryFn: async (): Promise<ConversationTailItem[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, sender_type, sender_name, type, body, transcript, created_at")
        .eq("account_id", accountId)
        .eq("conversation_id", conversationId!)
        .eq("is_private", false)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });
}

export interface LinkedArticle {
  id: string;
  title: string;
  status: string;
  body_md: string;
  linked: boolean;
}

/** Artigo da base ligado ao chamado, ou o rascunho que a IA escreveu a partir dele. */
export function useTicketArticle(accountId: string, ticketId: string, kbArticleId: string | null) {
  return useQuery({
    queryKey: ["support", accountId, "ticket-article", ticketId, kbArticleId],
    queryFn: async (): Promise<LinkedArticle | null> => {
      const cols = "id, title, status, body_md";
      if (kbArticleId) {
        const { data, error } = await supabase
          .from("kb_articles")
          .select(cols)
          .eq("account_id", accountId)
          .eq("id", kbArticleId)
          .maybeSingle();
        if (error) throw error;
        if (data) return { ...data, linked: true };
      }
      const { data, error } = await supabase
        .from("kb_articles")
        .select(cols)
        .eq("account_id", accountId)
        .eq("source_ticket_id", ticketId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, linked: false } : null;
    },
  });
}
