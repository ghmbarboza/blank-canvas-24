import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

export type Proposal = Tables<"proposals">;
export type Payment = Tables<"payments">;
export type Goal = Tables<"goals">;
export type CommissionRule = Tables<"commission_rules">;
export type Commission = Tables<"commissions">;

export const PROPOSAL_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "bg-surface-2 text-muted-foreground" },
  sent: { label: "Enviada", tone: "bg-primary-soft text-foreground" },
  viewed: { label: "Vista pelo cliente", tone: "bg-primary text-primary-foreground" },
  accepted: { label: "Aceita", tone: "bg-primary-soft text-foreground" },
  declined: { label: "Recusada", tone: "bg-danger/10 text-danger" },
  expired: { label: "Expirada", tone: "bg-surface-2 text-subtle" },
};

export const PAYMENT_STATUS: Record<string, string> = {
  pending: "Aguardando",
  confirmed: "Confirmado",
  received: "Recebido",
  overdue: "Vencido",
  refunded: "Estornado",
  canceled: "Cancelado",
};

export const BILLING_TYPE_LABEL: Record<string, string> = {
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão",
  UNDEFINED: "Cliente escolhe",
};

export const commerceKeys = {
  deal: (dealId: string) => ["commerce", "deal", dealId] as const,
  goals: (accountId: string, period: string) => ["goals", accountId, period] as const,
  rules: (accountId: string) => ["commission-rules", accountId] as const,
  commissions: (accountId: string) => ["commissions", accountId] as const,
};

export function proposalLink(token: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/proposta/${token}`;
}

export function useDealCommerce(dealId: string) {
  return useQuery({
    queryKey: commerceKeys.deal(dealId),
    queryFn: async () => {
      const [proposals, payments] = await Promise.all([
        supabase
          .from("proposals")
          .select("*")
          .eq("deal_id", dealId)
          .order("number", { ascending: false })
          .order("version", { ascending: false }),
        supabase
          .from("payments")
          .select("*")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false }),
      ]);
      if (proposals.error) throw proposals.error;
      if (payments.error) throw payments.error;
      return { proposals: proposals.data ?? [], payments: payments.data ?? [] };
    },
  });
}

export function useCreateProposal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title?: string;
      validDays: number;
      conditions?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("create_proposal", {
        _deal: dealId,
        _valid_days: input.validDays,
        ...(input.title ? { _title: input.title } : {}),
        ...(input.conditions ? { _conditions: input.conditions } : {}),
        ...(input.notes ? { _notes: input.notes } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.deal(dealId) }),
  });
}

export function useUpdateProposal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        title?: string;
        conditions?: string | null;
        notes?: string | null;
        valid_until?: string | null;
      };
    }) => {
      const { error } = await supabase.from("proposals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.deal(dealId) }),
  });
}

export function useRefreshProposal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("refresh_proposal", { _proposal: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.deal(dealId) }),
  });
}

/** Manda a proposta para assinatura eletrônica (ZapSign) e devolve o link do signatário. */
export function useSendForSignature(accountId: string, dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) =>
      callApi<{ ok: boolean; signUrl: string | null }>("/api/proposals", {
        accountId,
        action: "sign",
        proposalId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.deal(dealId) }),
  });
}

export function useDeleteProposal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("proposals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.deal(dealId) }),
  });
}

export function useSendProposal(accountId: string, dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; email?: string; message?: string }) =>
      callApi<{ ok: true; link: string; emailed: boolean }>("/api/proposals", {
        accountId,
        action: "send",
        ...input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.deal(dealId) }),
  });
}

export interface ChargeResult {
  id: string;
  kind: string;
  amount: number;
  invoice_url: string | null;
  pix_payload: string | null;
  pix_image: string | null;
}

export function useCreateCharge(accountId: string, dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      billingType: string;
      amount: number;
      recurring: "none" | "monthly";
      name: string;
      document: string;
      email?: string;
      dueDays: number;
      description?: string;
    }) =>
      callApi<{ ok: true; charges: ChargeResult[] }>("/api/payments", {
        accountId,
        action: "create",
        dealId,
        ...input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.deal(dealId) }),
  });
}

export function useSetForecastCategory(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      dealId,
      category,
      custom,
    }: {
      dealId: string;
      category: string;
      custom: Record<string, unknown>;
    }) => {
      const next = { ...custom };
      if (category === "pipeline") delete next["forecast_category"];
      else next["forecast_category"] = category;
      const { error } = await supabase
        .from("deals")
        .update({ custom: next as never })
        .eq("id", dealId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deals"] });
      void qc.invalidateQueries({ queryKey: ["crm"] });
      void qc.invalidateQueries({ queryKey: ["report", accountId] });
    },
  });
}

// ───────────────────────── metas e comissão ─────────────────────────
export interface GoalProgress {
  goal_id: string;
  user_id: string | null;
  metric: string;
  target: number;
  achieved: number;
}

export const METRIC_LABEL: Record<string, string> = {
  revenue: "Receita fechada",
  deals_won: "Negócios ganhos",
  meetings: "Reuniões realizadas",
  calls: "Ligações feitas",
  new_leads: "Novos leads",
};

export function useGoalsProgress(accountId: string, period: string) {
  return useQuery({
    queryKey: commerceKeys.goals(accountId, period),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("goals_progress", {
        _account: accountId,
        _period: period,
      });
      if (error) throw error;
      return ((data ?? []) as GoalProgress[]).map((g) => ({
        ...g,
        target: Number(g.target),
        achieved: Number(g.achieved),
      }));
    },
  });
}

export function useSaveGoal(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      period: string;
      user_id: string | null;
      metric: string;
      target: number;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (input.id) {
        const { error } = await supabase
          .from("goals")
          .update({ target: input.target })
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("goals").insert({
        account_id: accountId,
        period: input.period,
        user_id: input.user_id,
        metric: input.metric,
        target: input.target,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", accountId] }),
  });
}

export function useDeleteGoal(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals", accountId] }),
  });
}

export function useCommissionRules(accountId: string) {
  return useQuery({
    queryKey: commerceKeys.rules(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_rules")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveRule(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      percent: number;
      user_id: string | null;
      product_id: string | null;
      category: string | null;
      active?: boolean;
    }) => {
      const { id, ...values } = input;
      const { error } = id
        ? await supabase.from("commission_rules").update(values).eq("id", id)
        : await supabase.from("commission_rules").insert({ ...values, account_id: accountId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.rules(accountId) }),
  });
}

export function useDeleteRule(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commission_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.rules(accountId) }),
  });
}

export function useCommissions(accountId: string, period: { from: string; to: string }) {
  return useQuery({
    queryKey: [...commerceKeys.commissions(accountId), period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("*, deals(title, closed_at), commission_rules(name)")
        .eq("account_id", accountId)
        .neq("status", "canceled")
        .gte("created_at", `${period.from}T00:00:00`)
        .lte("created_at", `${period.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarkCommissionPaid(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("commissions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: commerceKeys.commissions(accountId) }),
  });
}

export interface CommissionTotals {
  total: number;
  pending: number;
  paid: number;
  base: number;
  byUser: Map<string, { total: number; pending: number }>;
}

const TOTALS_PAGE = 1000;

// Somas de comissão do período lidas em páginas de 1.000 (a lista detalhada corta em 500).
export function useCommissionTotals(accountId: string, period: { from: string; to: string }) {
  return useQuery({
    queryKey: [...commerceKeys.commissions(accountId), "totals", period],
    queryFn: async (): Promise<CommissionTotals> => {
      const rows: { user_id: string; amount: number; base: number; status: string }[] = [];
      for (let from = 0; ; from += TOTALS_PAGE) {
        const { data, error } = await supabase
          .from("commissions")
          .select("user_id, amount, base, status")
          .eq("account_id", accountId)
          .neq("status", "canceled")
          .gte("created_at", `${period.from}T00:00:00`)
          .lte("created_at", `${period.to}T23:59:59`)
          .order("created_at", { ascending: false })
          .range(from, from + TOTALS_PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < TOTALS_PAGE) break;
      }
      const byUser = new Map<string, { total: number; pending: number }>();
      let total = 0;
      let pending = 0;
      let base = 0;
      for (const r of rows) {
        const amount = Number(r.amount);
        const isPending = r.status === "pending";
        total += amount;
        base += Number(r.base);
        if (isPending) pending += amount;
        const cur = byUser.get(r.user_id) ?? { total: 0, pending: 0 };
        byUser.set(r.user_id, {
          total: cur.total + amount,
          pending: cur.pending + (isPending ? amount : 0),
        });
      }
      return { total, pending, paid: total - pending, base, byUser };
    },
  });
}
