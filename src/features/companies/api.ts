import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Company = Tables<"companies">;
export interface CompanyRow extends Company {
  contacts_count: number;
  open_value: number;
  open_deals: number;
  won_deals: number;
}

export const companyKeys = {
  list: (accountId: string, q: string) => ["companies", accountId, q] as const,
  one: (accountId: string, id: string) => ["company", accountId, id] as const,
  all: (accountId: string) => ["companies", accountId] as const,
};

export const SIZE_LABEL: Record<string, string> = {
  "1-10": "1 a 10 pessoas",
  "11-50": "11 a 50",
  "51-200": "51 a 200",
  "201-500": "201 a 500",
  "501-1000": "501 a 1.000",
  "1000+": "Mais de 1.000",
};

export function useCompanies(accountId: string, q: string) {
  return useQuery({
    queryKey: companyKeys.list(accountId, q),
    queryFn: async (): Promise<CompanyRow[]> => {
      let query = supabase
        .from("companies")
        .select("*, contacts(count), deals(value, status)")
        .eq("account_id", accountId)
        .order("name")
        .limit(500);
      const term = q.trim().replace(/[%*,()]/g, " ");
      if (term)
        query = query.or(
          `name.ilike.*${term}*,legal_name.ilike.*${term}*,cnpj.ilike.*${term.replace(/\D/g, "") || term}*,domain.ilike.*${term}*`,
        );
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((r) => {
        const deals = (r.deals as unknown as { value: number; status: string }[]) ?? [];
        const open = deals.filter((d) => d.status === "open");
        const contacts = (r.contacts as unknown as { count: number }[])?.[0]?.count ?? 0;
        const {
          contacts: _c,
          deals: _d,
          ...rest
        } = r as typeof r & { contacts: unknown; deals: unknown };
        return {
          ...(rest as Company),
          contacts_count: contacts,
          open_deals: open.length,
          won_deals: deals.filter((d) => d.status === "won").length,
          open_value: open.reduce((s, d) => s + Number(d.value ?? 0), 0),
        };
      });
    },
  });
}

export function useCompany(accountId: string, id: string) {
  return useQuery({
    queryKey: companyKeys.one(accountId, id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCompanyRelated(accountId: string, id: string) {
  return useQuery({
    queryKey: [...companyKeys.one(accountId, id), "related"],
    queryFn: async () => {
      const [contacts, deals] = await Promise.all([
        supabase
          .from("contacts")
          .select(
            "id, name, email, phone, job_title, score, temperature, avatar_url, source, last_interaction_at",
          )
          .eq("company_id", id)
          .order("last_interaction_at", { ascending: false, nullsFirst: false })
          .limit(200),
        supabase
          .from("deals")
          .select(
            "id, title, value, status, expected_close_date, stage_id, pipeline_stages(name), contact_id",
          )
          .eq("company_id", id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (contacts.error) throw contacts.error;
      if (deals.error) throw deals.error;
      return { contacts: contacts.data ?? [], deals: deals.data ?? [] };
    },
  });
}

export function useSaveCompany(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      values: Omit<TablesInsert<"companies">, "account_id">;
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from("companies")
          .update(input.values as TablesUpdate<"companies">)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("companies")
        .insert({ ...input.values, account_id: accountId, created_by: userData.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: companyKeys.all(accountId) });
      qc.setQueryData(companyKeys.one(accountId, row.id), row);
    },
  });
}

export function useDeleteCompany(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companyKeys.all(accountId) }),
  });
}

export function useLinkContactsToCompany(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      contactIds,
    }: {
      companyId: string | null;
      contactIds: string[];
    }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ company_id: companyId })
        .in("id", contactIds);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all(accountId) });
      void qc.invalidateQueries({ queryKey: ["company", accountId] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["contact"] });
    },
  });
}
