import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import { applySegment, isSegmentFilter, type SegmentFilter } from "./rules";

export type Segment = Omit<Tables<"segments">, "filter"> & { filter: SegmentFilter };

export const segmentKeys = { all: (accountId: string) => ["segments", accountId] as const };

export function useSegments(accountId: string, entity: "contact" | "company" | "deal" = "contact") {
  return useQuery({
    queryKey: [...segmentKeys.all(accountId), entity],
    queryFn: async (): Promise<Segment[]> => {
      const { data, error } = await supabase
        .from("segments")
        .select("*")
        .eq("account_id", accountId)
        .eq("entity", entity)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((s) => ({
        ...s,
        filter: isSegmentFilter(s.filter) ? s.filter : { match: "all", rules: [] },
      }));
    },
  });
}

export function useSegmentCount(accountId: string, filter: SegmentFilter | null, enabled = true) {
  return useQuery({
    queryKey: ["segment-count", accountId, filter],
    enabled: enabled && Boolean(filter),
    queryFn: async () => {
      const q = applySegment(
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId),
        filter,
      );
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useSaveSegment(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      filter: SegmentFilter;
      is_shared: boolean;
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from("segments")
          .update({ name: input.name, filter: input.filter as never, is_shared: input.is_shared })
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("segments")
        .insert({
          account_id: accountId,
          name: input.name,
          filter: input.filter as never,
          is_shared: input.is_shared,
          created_by: u.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: segmentKeys.all(accountId) }),
  });
}

export function useDeleteSegment(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: segmentKeys.all(accountId) }),
  });
}
