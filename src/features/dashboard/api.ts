import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAccountTimezone, useEvents } from "@/features/agenda/api";
import { rangeFor } from "@/features/agenda/calendar";
import { nowWall } from "@/features/agenda/tz";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAccountId } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { OPEN_STATUSES } from "@/features/support/constants";

import { STALLED_DAYS, type AttentionSources } from "./attention";

export function useTodayEvents() {
  const timeZone = useAccountTimezone();
  const range = useMemo(() => rangeFor("day", nowWall(timeZone)), [timeZone]);
  return useEvents(range);
}

export type HotLead = Pick<
  Tables<"contacts">,
  "id" | "name" | "company" | "avatar_url" | "source" | "score" | "temperature" | "ai_next_step"
>;

export function useHotLeads(limit = 6) {
  const accountId = useAccountId();
  return useQuery({
    queryKey: ["dashboard", accountId, "hot-leads", limit],
    queryFn: async (): Promise<HotLead[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, company, avatar_url, source, score, temperature, ai_next_step")
        .eq("account_id", accountId)
        .eq("temperature", "hot")
        .order("score", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const SCAN = 5;

function contactName(c: unknown, fallback: string | null): string {
  const name = (c as { name?: string | null } | null)?.name;
  return name || fallback || "Contato sem nome";
}

// Fontes do "O que precisa de você". Cada consulta é pequena e filtra pela conta.
export function useAttentionSources(enabled: boolean) {
  const accountId = useAccountId();
  return useQuery({
    queryKey: ["dashboard", accountId, "attention"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AttentionSources> => {
      const stalledBefore = new Date(Date.now() - STALLED_DAYS * 86_400_000).toISOString();
      const [hot, handoffs, deals, tickets] = await Promise.all([
        supabase
          .from("conversations")
          .select(
            "id, title, unread_count, last_inbound_at, contact:contacts!inner(name, temperature)",
          )
          .eq("account_id", accountId)
          .eq("status", "open")
          .eq("is_group", false)
          .gt("unread_count", 0)
          .eq("contact.temperature", "hot")
          .order("last_inbound_at", { ascending: true, nullsFirst: false })
          .limit(SCAN),
        supabase
          .from("conversations")
          .select("id, title, ai_handoff_at, ai_handoff_reason, contact:contacts(name)")
          .eq("account_id", accountId)
          .eq("status", "open")
          .is("assignee_user_id", null)
          .not("ai_handoff_at", "is", null)
          .order("ai_handoff_at", { ascending: true })
          .limit(SCAN),
        supabase
          .from("deals")
          .select("id, title, value, updated_at, contact:contacts(name)")
          .eq("account_id", accountId)
          .eq("status", "open")
          .lt("updated_at", stalledBefore)
          .order("value", { ascending: false })
          .limit(SCAN),
        supabase
          .from("tickets")
          .select(
            "id, number, subject, status, created_at, first_response_at, first_response_due_at, resolution_due_at",
          )
          .eq("account_id", accountId)
          .in("status", OPEN_STATUSES)
          .not("resolution_due_at", "is", null)
          .order("resolution_due_at", { ascending: true })
          .limit(20),
      ]);
      const failed = [hot, handoffs, deals, tickets].find((r) => r.error);
      if (failed?.error) throw failed.error;
      return {
        hot: (hot.data ?? []).map((c) => ({
          id: c.id,
          name: contactName(c.contact, c.title),
          unread: c.unread_count,
          last_inbound_at: c.last_inbound_at,
        })),
        handoffs: (handoffs.data ?? []).map((c) => ({
          id: c.id,
          name: contactName(c.contact, c.title),
          reason: c.ai_handoff_reason,
          at: c.ai_handoff_at ?? new Date().toISOString(),
        })),
        deals: (deals.data ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          value: Number(d.value),
          contact: (d.contact as { name?: string | null } | null)?.name ?? null,
          updated_at: d.updated_at,
        })),
        tickets: tickets.data ?? [],
      };
    },
  });
}

// Assumir a passagem da IA: a conversa vai para o seu nome.
export function useClaimConversation() {
  const accountId = useAccountId();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error("Entre de novo para assumir a conversa.");
      const { error } = await supabase
        .from("conversations")
        .update({ assignee_user_id: user.id })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throw error;
      return conversationId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard", accountId, "attention"] });
      void qc.invalidateQueries({ queryKey: ["inbox", accountId] });
      toast.success("Conversa assumida");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
