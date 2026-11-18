import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import type { FormConsent, FormDestination, FormField, FormTheme, LandingBlock } from "./types";

export interface FormRow extends Omit<
  Tables<"forms">,
  "fields" | "consent" | "destination" | "theme"
> {
  fields: FormField[];
  consent: FormConsent;
  destination: FormDestination;
  theme: FormTheme;
}
export interface LandingRow extends Omit<Tables<"landing_pages">, "blocks" | "theme"> {
  blocks: LandingBlock[];
  theme: FormTheme;
}

export const formKeys = {
  all: (accountId: string) => ["forms", accountId] as const,
  one: (id: string) => ["form", id] as const,
  pages: (accountId: string) => ["landing-pages", accountId] as const,
  page: (id: string) => ["landing-page", id] as const,
};

export function useForms(accountId: string) {
  return useQuery({
    queryKey: formKeys.all(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("*")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as FormRow[];
    },
  });
}

export function useForm(id: string) {
  return useQuery({
    queryKey: formKeys.one(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("forms").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as unknown as FormRow | null;
    },
  });
}

export function useSaveForm(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<FormRow> & { id?: string; name: string }) => {
      const { id, ...rest } = input;
      const values = {
        ...rest,
        ...(rest.fields ? { fields: rest.fields as unknown as Json } : {}),
        ...(rest.consent ? { consent: rest.consent as unknown as Json } : {}),
        ...(rest.destination ? { destination: rest.destination as unknown as Json } : {}),
        ...(rest.theme ? { theme: rest.theme as unknown as Json } : {}),
      };
      if (id) {
        const { data, error } = await supabase
          .from("forms")
          .update(values as never)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as FormRow;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("forms")
        .insert({ ...values, account_id: accountId, created_by: u.user?.id ?? null } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FormRow;
    },
    onSuccess: (f) => {
      void qc.invalidateQueries({ queryKey: formKeys.all(accountId) });
      qc.setQueryData(formKeys.one(f.id), f);
    },
  });
}

export function useDeleteForm(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: formKeys.all(accountId) }),
  });
}

export function useSubmissions(accountId: string, formId?: string) {
  return useQuery({
    queryKey: ["form-submissions", accountId, formId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("form_submissions")
        .select(
          "id, created_at, source, payload, utm, page_url, referrer, contact_id, form_id, confirmed_at, contacts(name, email, phone), forms(name)",
        )
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (formId) q = q.eq("form_id", formId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLandingPages(accountId: string) {
  return useQuery({
    queryKey: formKeys.pages(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_pages")
        .select("*")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LandingRow[];
    },
  });
}

export function useLandingPage(id: string) {
  return useQuery({
    queryKey: formKeys.page(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_pages")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as LandingRow | null;
    },
  });
}

export function useSaveLanding(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Partial<LandingRow> & { id?: string; title: string; slug: string },
    ) => {
      const { id, ...rest } = input;
      const values = {
        ...rest,
        ...(rest.blocks ? { blocks: rest.blocks as unknown as Json } : {}),
        ...(rest.theme ? { theme: rest.theme as unknown as Json } : {}),
      };
      if (id) {
        const { data, error } = await supabase
          .from("landing_pages")
          .update(values as never)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as LandingRow;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("landing_pages")
        .insert({ ...values, account_id: accountId, created_by: u.user?.id ?? null } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LandingRow;
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: formKeys.pages(accountId) });
      qc.setQueryData(formKeys.page(p.id), p);
    },
  });
}

export function useDeleteLanding(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("landing_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: formKeys.pages(accountId) }),
  });
}

export function useWebchatChannels(accountId: string) {
  return useQuery({
    queryKey: ["webchat-channels", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, config, status, ai_enabled")
        .eq("account_id", accountId)
        .eq("provider", "webchat");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveWebchat(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      channelId?: string;
      name: string;
      greeting: string;
      color: string;
      ai: boolean;
      ask_email: boolean;
    }) => callApi<{ id: string }>("/api/webchat", { accountId, action: "save_channel", ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webchat-channels", accountId] }),
  });
}

export function useAttribution(accountId: string, days: number) {
  return useQuery({
    queryKey: ["attribution", accountId, days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("contact_attribution")
        .select("first_source, first_medium, first_campaign, won_value, won_count, lifecycle")
        .eq("account_id", accountId)
        .gte("created_at", since)
        .limit(5000);
      if (error) throw error;
      const groups = new Map<
        string,
        { source: string; medium: string; leads: number; customers: number; revenue: number }
      >();
      for (const r of data ?? []) {
        const key = `${r.first_source ?? "direto"}|${r.first_medium ?? "none"}`;
        const g = groups.get(key) ?? {
          source: r.first_source ?? "direto",
          medium: r.first_medium ?? "none",
          leads: 0,
          customers: 0,
          revenue: 0,
        };
        g.leads += 1;
        if ((r.won_count ?? 0) > 0 || r.lifecycle === "customer") g.customers += 1;
        g.revenue += Number(r.won_value ?? 0);
        groups.set(key, g);
      }
      return [...groups.values()].sort((a, b) => b.leads - a.leads);
    },
  });
}

export interface WeeklyEntries {
  /** Respostas por formulário nos últimos 7 dias. */
  byForm: Map<string, number>;
  /** Entradas sem formulário (anúncio, chat, API) por origem, nos últimos 7 dias. */
  bySource: Map<string, number>;
}

const WEEK_PAGE = 1000;
const WEEK_MAX_PAGES = 20;

// Quantas entradas cada porta recebeu na semana. Pagina: o PostgREST corta em 1.000 sem avisar.
export function useWeeklyEntries(accountId: string) {
  return useQuery({
    queryKey: ["form-submissions", accountId, "week"],
    queryFn: async (): Promise<WeeklyEntries> => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const byForm = new Map<string, number>();
      const bySource = new Map<string, number>();
      for (let page = 0; page < WEEK_MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from("form_submissions")
          .select("form_id, source")
          .eq("account_id", accountId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(page * WEEK_PAGE, page * WEEK_PAGE + WEEK_PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          if (r.form_id) byForm.set(r.form_id, (byForm.get(r.form_id) ?? 0) + 1);
          else bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);
        }
        if ((data ?? []).length < WEEK_PAGE) break;
      }
      return { byForm, bySource };
    },
  });
}
