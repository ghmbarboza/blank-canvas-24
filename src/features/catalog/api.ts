import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Product = Tables<"products">;
export type ProductRelation = Tables<"product_relations">;
export type Billing = "one_time" | "monthly" | "yearly";
export type RelationKind = "upsell" | "cross_sell";

export const BILLING_LABEL: Record<string, string> = {
  one_time: "avulso",
  monthly: "por mês",
  yearly: "por ano",
};

export const RELATION_LABEL: Record<RelationKind, string> = {
  upsell: "Upsell",
  cross_sell: "Cross-sell",
};

export const catalogKeys = {
  products: (accountId: string) => ["products", accountId] as const,
  relations: (accountId: string) => ["product_relations", accountId] as const,
};

export function useProducts(accountId: string) {
  return useQuery({
    queryKey: catalogKeys.products(accountId),
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("account_id", accountId)
        .order("position")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRelations(accountId: string) {
  return useQuery({
    queryKey: catalogKeys.relations(accountId),
    queryFn: async (): Promise<ProductRelation[]> => {
      const { data, error } = await supabase
        .from("product_relations")
        .select("*")
        .eq("account_id", accountId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ProductDraft {
  id?: string;
  name: string;
  description: string | null;
  kind: "product" | "service";
  category: string | null;
  price: number;
  billing: Billing;
  keywords: string[];
  active: boolean;
  relations: { related_id: string; kind: RelationKind; pitch: string | null }[];
}

// Salva o produto e substitui as relações de upsell/cross-sell que partem dele.
export function useSaveProduct(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ relations, id, ...fields }: ProductDraft) => {
      const row: TablesInsert<"products"> = { account_id: accountId, ...fields };
      const { data, error } = id
        ? await supabase.from("products").update(row).eq("id", id).select("id").single()
        : await supabase.from("products").insert(row).select("id").single();
      if (error) throw error;
      const productId = data.id;
      const { error: delErr } = await supabase
        .from("product_relations")
        .delete()
        .eq("product_id", productId);
      if (delErr) throw delErr;
      const rows = relations
        .filter((r) => r.related_id !== productId)
        .map((r) => ({ account_id: accountId, product_id: productId, ...r }));
      if (rows.length) {
        const { error: relErr } = await supabase.from("product_relations").insert(rows);
        if (relErr) throw relErr;
      }
      return productId;
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: catalogKeys.products(accountId) }),
        qc.invalidateQueries({ queryKey: catalogKeys.relations(accountId) }),
      ]),
  });
}

export function useDeleteProduct(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: catalogKeys.products(accountId) }),
        qc.invalidateQueries({ queryKey: catalogKeys.relations(accountId) }),
      ]),
  });
}
