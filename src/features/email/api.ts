import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

import type { DnsCheck } from "./dns";

export type EmailTemplate = Tables<"email_templates">;
export type EmailCampaign = Tables<"email_campaigns">;
export type CampaignStats = Tables<"email_campaign_stats">;

export const emailKeys = {
  templates: (a: string) => ["email-templates", a] as const,
  campaigns: (a: string) => ["email-campaigns", a] as const,
  campaign: (a: string, id: string) => ["email-campaign", a, id] as const,
  health: (a: string) => ["email-health", a] as const,
  domains: (a: string) => ["email-domains", a] as const,
};

export function emailApi<T>(accountId: string, action: string, body: Record<string, unknown> = {}) {
  return callApi<T>("/api/email", { accountId, action, ...body });
}

// ── modelos ──────────────────────────────────────────────────────────────────
export function useTemplates(accountId: string, category?: string) {
  return useQuery({
    queryKey: [...emailKeys.templates(accountId), category ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("email_templates")
        .select("*")
        .eq("account_id", accountId)
        .order("updated_at", { ascending: false });
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveTemplate(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      values: Omit<TablesInsert<"email_templates">, "account_id">;
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from("email_templates")
          .update(input.values as TablesUpdate<"email_templates">)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("email_templates")
        .insert({ ...input.values, account_id: accountId, created_by: u.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.templates(accountId) }),
  });
}

export function useDeleteTemplate(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.templates(accountId) }),
  });
}

// ── campanhas ────────────────────────────────────────────────────────────────
export function useCampaigns(accountId: string) {
  return useQuery({
    queryKey: emailKeys.campaigns(accountId),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((c) => c.status === "sending") ? 5000 : false,
    queryFn: async () => {
      const [{ data, error }, { data: stats }] = await Promise.all([
        supabase
          .from("email_campaigns")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase.from("email_campaign_stats").select("*"),
      ]);
      if (error) throw error;
      const byId = new Map((stats ?? []).map((s) => [s.campaign_id, s]));
      return (data ?? []).map((c) => ({ ...c, stats: byId.get(c.id) ?? null }));
    },
  });
}

export function useCampaign(accountId: string, id: string) {
  return useQuery({
    queryKey: emailKeys.campaign(accountId, id),
    refetchInterval: (q) => (q.state.data?.campaign.status === "sending" ? 4000 : false),
    queryFn: async () => {
      const [{ data: c, error }, { data: stats }] = await Promise.all([
        supabase.from("email_campaigns").select("*").eq("id", id).maybeSingle(),
        supabase.from("email_campaign_stats").select("*").eq("campaign_id", id).maybeSingle(),
      ]);
      if (error) throw error;
      if (!c) throw new Error("Campanha não encontrada");
      return { campaign: c, stats };
    },
  });
}

export function useCampaignInsights(accountId: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...emailKeys.campaign(accountId, id), "insights"],
    enabled,
    queryFn: async () => {
      const [{ data: msgIds }, { data: clickers }] = await Promise.all([
        supabase
          .from("email_messages")
          .select("id")
          .eq("campaign_id", id)
          .not("clicked_at", "is", null)
          .limit(1000),
        supabase
          .from("email_messages")
          .select("id, to_email, clicked_at, first_cta, click_count, contact_id, contacts(name)")
          .eq("campaign_id", id)
          .not("clicked_at", "is", null)
          .order("clicked_at", { ascending: false })
          .limit(100),
      ]);
      const ids = (msgIds ?? []).map((m) => m.id);
      const { data: clicks } = ids.length
        ? await supabase
            .from("email_events")
            .select("cta, url")
            .eq("type", "click")
            .in("email_message_id", ids.slice(0, 500))
        : { data: [] as { cta: string | null; url: string | null }[] };
      const ctas = new Map<string, number>();
      for (const c of clicks ?? []) {
        const k = c.cta || c.url || "(sem texto)";
        ctas.set(k, (ctas.get(k) ?? 0) + 1);
      }
      return {
        ctas: [...ctas.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count })),
        clickers: clickers ?? [],
      };
    },
  });
}

export function useSaveCampaign(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      values: Partial<TablesInsert<"email_campaigns">>;
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from("email_campaigns")
          .update(input.values as TablesUpdate<"email_campaigns">)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          name: "Nova campanha",
          ...input.values,
          account_id: accountId,
          created_by: u.user?.id ?? null,
        } as TablesInsert<"email_campaigns">)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: emailKeys.campaigns(accountId) });
      void qc.invalidateQueries({ queryKey: emailKeys.campaign(accountId, row.id) });
    },
  });
}

export function useDeleteCampaign(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.campaigns(accountId) }),
  });
}

export function useCampaignAction(accountId: string, campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      action:
        | "campaign_test"
        | "campaign_start"
        | "campaign_pause"
        | "campaign_resume"
        | "campaign_cancel";
      to?: string;
      scheduledAt?: string | null;
    }) =>
      emailApi<{ ok: true; status?: string; audience?: number; to?: string }>(
        accountId,
        input.action,
        {
          campaignId,
          ...(input.to ? { to: input.to } : {}),
          ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
        },
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: emailKeys.campaign(accountId, campaignId) });
      void qc.invalidateQueries({ queryKey: emailKeys.campaigns(accountId) });
    },
  });
}

export function useAudienceCount(accountId: string, segmentId: string | null) {
  return useQuery({
    queryKey: ["email-audience", accountId, segmentId],
    enabled: Boolean(segmentId),
    queryFn: () =>
      emailApi<{ count: number }>(accountId, "audience", { segmentId }).then((r) => r.count),
  });
}

// ── saúde, domínio e configuração ─────────────────────────────────────────────
export interface EmailHealth {
  sent: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  bounceRate: number;
  spamRate: number;
  openRate: number;
  clickRate: number;
  bounceLevel: "ok" | "warn" | "bad";
  spamLevel: "ok" | "warn" | "bad";
}

export function useEmailHealth(accountId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.health(accountId),
    enabled,
    queryFn: () => emailApi<EmailHealth>(accountId, "health"),
  });
}

export function useEmailDomains(accountId: string) {
  return useQuery({
    queryKey: emailKeys.domains(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_domains")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDomainCheck(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) =>
      emailApi<DnsCheck & { domain: string }>(accountId, "domain_check", { domain }),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.domains(accountId) }),
  });
}

export function useEmailSetupInfo(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["email-setup", accountId],
    enabled,
    queryFn: () => emailApi<{ resendWebhook: string; inboundUrl: string }>(accountId, "setup_info"),
  });
}

export function useSendEmail(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      to?: string;
      subject: string;
      text: string;
      contactId?: string | null;
      dealId?: string | null;
    }) =>
      emailApi<{ ok: true; id: string }>(accountId, "send", {
        subject: input.subject,
        text: input.text,
        ...(input.to ? { to: input.to } : {}),
        ...(input.contactId ? { contactId: input.contactId } : {}),
        ...(input.dealId ? { dealId: input.dealId } : {}),
      }),
    onSuccess: (_r, input) => {
      if (input.contactId) {
        void qc.invalidateQueries({ queryKey: ["timeline360", input.contactId] });
        void qc.invalidateQueries({ queryKey: ["contacts", accountId] });
      }
    },
  });
}
