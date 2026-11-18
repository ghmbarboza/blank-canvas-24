import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/functions";

import { DEFAULT_FILTERS } from "./lib/filters";
import type { InboxFilters } from "./types";

// Visões salvas da Caixa (#64): filtros com nome, de cada pessoa (RLS: user_id = auth.uid()).
export interface InboxView {
  id: string;
  name: string;
  filters: InboxFilters;
}

const key = (accountId: string) => ["inbox", accountId, "views"] as const;

/** O que sai do banco vira filtro válido: campo desconhecido ou de tipo errado cai no padrão. */
export function viewFilters(raw: unknown): InboxFilters {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const status = o["status"];
  const scope = o["scope"];
  return {
    ...DEFAULT_FILTERS,
    ...(status === "open" || status === "pending" || status === "snoozed" || status === "closed"
      ? { status }
      : {}),
    ...(scope === "all" || scope === "mine" || scope === "unassigned" || scope === "ai"
      ? { scope }
      : {}),
    unread: o["unread"] === true,
    platform: str(o["platform"]),
    tag: str(o["tag"]),
    search: typeof o["search"] === "string" ? o["search"].slice(0, 100) : "",
  };
}

export function useInboxViews(accountId: string) {
  return useQuery({
    queryKey: key(accountId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<InboxView[]> => {
      const { data, error } = await supabase
        .from("inbox_views")
        .select("id, name, filters")
        .eq("account_id", accountId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((v) => ({ id: v.id, name: v.name, filters: viewFilters(v.filters) }));
    },
  });
}

export function useSaveInboxView(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: InboxFilters }) => {
      const { error } = await supabase
        .from("inbox_views")
        .upsert(
          { account_id: accountId, name: name.trim(), filters: filters as unknown as Json },
          { onConflict: "account_id,user_id,name" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(`Visão “${v.name.trim()}” salva`);
      void qc.invalidateQueries({ queryKey: key(accountId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteInboxView(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inbox_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(accountId) }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
