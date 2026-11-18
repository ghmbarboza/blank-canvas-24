import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

import type { DealItem } from "./lib";

export const oppKeys = {
  all: (accountId: string) => ["opportunity", accountId] as const,
  interests: (accountId: string, contactId: string) =>
    ["opportunity", accountId, "interests", contactId] as const,
  contact: (accountId: string, contactId: string) =>
    ["opportunity", accountId, "contact", contactId] as const,
  items: (accountId: string, dealId: string) =>
    ["opportunity", accountId, "items", dealId] as const,
  replied: (accountId: string, contactId: string) =>
    ["opportunity", accountId, "replied", contactId] as const,
};

export type InterestRow = Tables<"contact_interests"> & {
  products: Pick<Tables<"products">, "name" | "price" | "billing"> | null;
};

export interface ContactOpportunity {
  deal: Pick<
    Tables<"deals">,
    "id" | "title" | "value" | "potential_value" | "value_source" | "stage_id" | "pipeline_id"
  > & { stage: { name: string } | null };
  items: DealItem[];
}

// Tudo que mexe em oportunidade invalida as telas que mostram valor de negócio.
function refresh(qc: QueryClient, accountId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: oppKeys.all(accountId) }),
    qc.invalidateQueries({ queryKey: ["deals", accountId] }),
    qc.invalidateQueries({ queryKey: ["contacts", accountId] }),
    qc.invalidateQueries({ queryKey: ["dashboard", accountId] }),
  ]);
}

export function useContactInterests(accountId: string, contactId: string) {
  return useQuery({
    queryKey: oppKeys.interests(accountId, contactId),
    queryFn: async (): Promise<InterestRow[]> => {
      const { data, error } = await supabase
        .from("contact_interests")
        .select("*, products(name, price, billing)")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("confidence", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InterestRow[];
    },
  });
}

// "Atender" está cumprido quando alguém da empresa (pessoa ou IA) já respondeu o contato.
export function useContactReplied(accountId: string, contactId: string) {
  return useQuery({
    queryKey: oppKeys.replied(accountId, contactId),
    queryFn: async (): Promise<boolean> => {
      const { data: convs, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("account_id", accountId)
        .eq("contact_id", contactId);
      if (error) throw error;
      const ids = (convs ?? []).map((c) => c.id);
      if (!ids.length) return false;
      const { count, error: mErr } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids)
        .eq("direction", "out")
        .eq("is_private", false);
      if (mErr) throw mErr;
      return (count ?? 0) > 0;
    },
  });
}

export function useContactOpportunity(accountId: string, contactId: string) {
  return useQuery({
    queryKey: oppKeys.contact(accountId, contactId),
    queryFn: async (): Promise<ContactOpportunity | null> => {
      const { data: deal, error } = await supabase
        .from("deals")
        .select(
          "id, title, value, potential_value, value_source, stage_id, pipeline_id, stage:pipeline_stages(name)",
        )
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!deal) return null;
      const { data: items, error: iErr } = await supabase
        .from("deal_items")
        .select("*")
        .eq("deal_id", deal.id)
        .order("position");
      if (iErr) throw iErr;
      return { deal: deal as ContactOpportunity["deal"], items: items ?? [] };
    },
  });
}

export function useDealItems(accountId: string, dealId: string) {
  return useQuery({
    queryKey: oppKeys.items(accountId, dealId),
    queryFn: async (): Promise<DealItem[]> => {
      const { data, error } = await supabase
        .from("deal_items")
        .select("*")
        .eq("deal_id", dealId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetInterest(accountId: string, contactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, confidence }: { productId: string; confidence: number }) => {
      const { error } = await supabase.from("contact_interests").upsert(
        {
          account_id: accountId,
          contact_id: contactId,
          product_id: productId,
          confidence,
          source: "manual",
        },
        { onConflict: "contact_id,product_id" },
      );
      if (error) throw error;
    },
    onSettled: () => refresh(qc, accountId),
  });
}

export function useRemoveInterest(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_interests").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => refresh(qc, accountId),
  });
}

export function useBuildOpportunity(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { data, error } = await supabase.rpc("build_opportunity", { _contact: contactId });
      if (error) throw error;
      return data;
    },
    onSettled: () => refresh(qc, accountId),
  });
}

export function useUpdateDealItem(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"deal_items"> }) => {
      const { error } = await supabase.from("deal_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => refresh(qc, accountId),
  });
}

export function useAddDealItem(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      dealId: string;
      product: Pick<Tables<"products">, "id" | "name" | "price" | "billing">;
      kind: "core" | "upsell" | "cross_sell";
      position: number;
    }) => {
      const { error } = await supabase.from("deal_items").insert({
        account_id: accountId,
        deal_id: input.dealId,
        product_id: input.product.id,
        name: input.product.name,
        unit_price: input.product.price,
        billing: input.product.billing,
        kind: input.kind,
        status: "accepted",
        source: "manual",
        position: input.position,
      });
      if (error) throw error;
    },
    onSettled: () => refresh(qc, accountId),
  });
}

export function useRemoveDealItem(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deal_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => refresh(qc, accountId),
  });
}
