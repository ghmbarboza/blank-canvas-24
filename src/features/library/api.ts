import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface SearchFilters {
  q: string;
  source: "all" | "meeting" | "call";
  days: number | null;
  userId: string | null;
}

export const TERM_CATEGORY: Record<string, string> = {
  competitor: "Concorrente",
  price: "Preço",
  cancellation: "Cancelamento",
  other: "Outro",
};

export const libraryKeys = {
  search: (a: string, f: SearchFilters) => ["conversation-search", a, f] as const,
  terms: (a: string) => ["tracked-terms", a] as const,
  mentions: (a: string, days: number) => ["term-mentions", a, days] as const,
  highlights: (a: string) => ["conversation-highlights", a] as const,
};

export function useConversationSearch(accountId: string, f: SearchFilters) {
  return useQuery({
    queryKey: libraryKeys.search(accountId, f),
    enabled: f.q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("conversation_search", {
        _account: accountId,
        _q: f.q.trim(),
        _limit: 100,
        ...(f.source !== "all" ? { _source: f.source } : {}),
        ...(f.days ? { _days: f.days } : {}),
        ...(f.userId ? { _user: f.userId } : {}),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTrackedTerms(accountId: string) {
  return useQuery({
    queryKey: libraryKeys.terms(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracked_terms")
        .select("*")
        .eq("account_id", accountId)
        .order("term");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTermMentions(accountId: string, days: number) {
  return useQuery({
    queryKey: libraryKeys.mentions(accountId, days),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("term_mentions", {
        _account: accountId,
        _days: days,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveTerm(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { term: string; category: string; alert: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("tracked_terms")
        .insert({ account_id: accountId, ...input, created_by: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libraryKeys.terms(accountId) });
      void qc.invalidateQueries({ queryKey: ["term-mentions", accountId] });
    },
  });
}

export function useDeleteTerm(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tracked_terms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: libraryKeys.terms(accountId) });
      void qc.invalidateQueries({ queryKey: ["term-mentions", accountId] });
    },
  });
}

export function useHighlights(accountId: string) {
  return useQuery({
    queryKey: libraryKeys.highlights(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_highlights")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveHighlight(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      source: "meeting" | "call";
      source_id: string;
      excerpt: string;
      note?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("conversation_highlights").insert({
        account_id: accountId,
        source: input.source,
        source_id: input.source_id,
        excerpt: input.excerpt.slice(0, 2000),
        note: input.note ?? null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKeys.highlights(accountId) }),
  });
}

export function useDeleteHighlight(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conversation_highlights").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKeys.highlights(accountId) }),
  });
}

/** Agrupa as menções por termo, com a série semanal completa (semanas sem menção = 0). */
export function mentionSeries(
  rows: { term_id: string; term: string; category: string; week: string; mentions: number }[],
  weeks: string[],
) {
  const byTerm = new Map<
    string,
    { term: string; category: string; total: number; series: number[] }
  >();
  for (const r of rows) {
    const t = byTerm.get(r.term_id) ?? {
      term: r.term,
      category: r.category,
      total: 0,
      series: weeks.map(() => 0),
    };
    const i = weeks.indexOf(r.week);
    if (i >= 0) t.series[i] = (t.series[i] ?? 0) + Number(r.mentions);
    t.total += Number(r.mentions);
    byTerm.set(r.term_id, t);
  }
  return [...byTerm.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
}

/** Segundas-feiras (início de semana ISO) das últimas `count` semanas, em ordem crescente. */
export function lastWeeks(count: number, now = new Date()): string[] {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  d.setUTCDate(d.getUTCDate() - dow);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const w = new Date(d);
    w.setUTCDate(d.getUTCDate() - i * 7);
    out.push(w.toISOString().slice(0, 10));
  }
  return out;
}
