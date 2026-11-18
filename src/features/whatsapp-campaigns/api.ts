import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { callApi } from "@/lib/api";
import { errorMessage } from "@/lib/functions";

// Campanhas de WhatsApp (#67): tabelas whatsapp_campaigns/targets, RPCs de público e disparo.
export interface WaCampaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "sending" | "done" | "canceled";
  scheduled_at: string | null;
  channel_id: string;
  template_name: string;
  template_language: string;
  template_params: string[];
  audience_tags: string[];
  launched_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface WaTemplate {
  name: string;
  language: string;
  category: string;
  body: string;
  variables: number;
  unsupported: boolean;
}

export type CampaignCounts = Record<"queued" | "sent" | "skipped" | "failed", number>;

const key = (accountId: string) => ["wa-campaigns", accountId] as const;

export function useWaCampaigns(accountId: string) {
  return useQuery({
    queryKey: key(accountId),
    refetchInterval: (q) =>
      (q.state.data as WaCampaign[] | undefined)?.some((c) => c.status === "sending")
        ? 15_000
        : false,
    queryFn: async (): Promise<WaCampaign[]> => {
      const { data, error } = await supabase
        .from("whatsapp_campaigns")
        .select(
          "id, name, status, channel_id, template_name, template_language, template_params, audience_tags, launched_at, scheduled_at, finished_at, created_at",
        )
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WaCampaign[];
    },
  });
}

export function useCampaignCounts(accountId: string, campaignId: string, live: boolean) {
  return useQuery({
    queryKey: [...key(accountId), "counts", campaignId] as const,
    refetchInterval: live ? 15_000 : false,
    queryFn: async (): Promise<CampaignCounts> => {
      const statuses = ["queued", "sent", "skipped", "failed"] as const;
      const results = await Promise.all(
        statuses.map((s) =>
          supabase
            .from("whatsapp_campaign_targets")
            .select("id", { head: true, count: "exact" })
            .eq("campaign_id", campaignId)
            .eq("status", s),
        ),
      );
      const counts = { queued: 0, sent: 0, skipped: 0, failed: 0 };
      results.forEach((r, i) => {
        if (r.error) throw r.error;
        counts[statuses[i]!] = r.count ?? 0;
      });
      return counts;
    },
  });
}

export function useWaTemplates(accountId: string, channelId: string | null) {
  return useQuery({
    queryKey: ["wa-templates", accountId, channelId],
    enabled: Boolean(channelId),
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (
        await callApi<{ templates: WaTemplate[] }>("/api/whatsapp/templates", {
          accountId,
          channelId: channelId!,
        })
      ).templates.filter((t) => !t.unsupported),
  });
}

export function useAudiencePreview(accountId: string, tags: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["wa-audience", accountId, tags.join(",")],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("whatsapp_campaign_preview", {
        _account: accountId,
        _tags: tags,
      });
      if (error) throw error;
      return data as { eligible: number; with_phone: number };
    },
  });
}

export function useCreateWaCampaign(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      name: string;
      channelId: string;
      template: WaTemplate;
      params: string[];
      tags: string[];
    }) => {
      const { data, error } = await supabase
        .from("whatsapp_campaigns")
        .insert({
          account_id: accountId,
          name: v.name.trim(),
          channel_id: v.channelId,
          template_name: v.template.name,
          template_language: v.template.language,
          template_params: v.params,
          audience_tags: v.tags,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(accountId) }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useCampaignAction(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      at,
    }: {
      id: string;
      action: "launch" | "schedule" | "cancel" | "delete";
      at?: string;
    }) => {
      if (action === "schedule") {
        const { error } = await supabase.rpc(
          "schedule_whatsapp_campaign" as never,
          {
            _campaign: id,
            _at: at,
          } as never,
        );
        if (error) throw error;
        return `Campanha agendada para ${new Date(at!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
      }
      if (action === "launch") {
        const { data, error } = await supabase.rpc("launch_whatsapp_campaign", { _campaign: id });
        if (error) throw error;
        return `Disparo iniciado para ${data} contatos`;
      }
      if (action === "cancel") {
        const { error } = await supabase.rpc("cancel_whatsapp_campaign", { _campaign: id });
        if (error) throw error;
        return "Campanha cancelada: quem ainda não recebeu não recebe mais";
      }
      const { error } = await supabase.from("whatsapp_campaigns").delete().eq("id", id);
      if (error) throw error;
      return "Rascunho apagado";
    },
    onSuccess: (msg) => {
      toast.success(msg);
      void qc.invalidateQueries({ queryKey: key(accountId) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** "vip, Clínica Centro" → ["vip", "Clínica Centro"]: etiquetas do contato, como estão escritas. */
export function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, 10);
}
