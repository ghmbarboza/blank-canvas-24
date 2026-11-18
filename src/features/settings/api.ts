import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { ACCOUNT_QUERY_KEY, type AccountSettings, type Role } from "@/lib/account";

// ---------------------------------------------------------------- equipe

export interface TeamMember {
  userId: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export function teamKey(accountId: string) {
  return ["team", accountId] as const;
}

// Membros da conta com nome do perfil (profiles.full_name) ou o apelido na conta.
export function useTeamMembers(accountId: string) {
  return useQuery({
    queryKey: teamKey(accountId),
    queryFn: async (): Promise<TeamMember[]> => {
      const { data: rows, error } = await supabase
        .from("memberships")
        .select("user_id, role, display_name, is_active, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        if (pErr) throw pErr;
        for (const p of profiles ?? []) if (p.full_name) names.set(p.id, p.full_name);
      }
      return (rows ?? []).map((r) => ({
        userId: r.user_id,
        name: names.get(r.user_id) ?? r.display_name ?? "Sem nome",
        role: r.role,
        isActive: r.is_active,
        createdAt: r.created_at,
      }));
    },
  });
}

export function useUpdateMembership(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role?: Role; isActive?: boolean }) => {
      const patch: { role?: Role; is_active?: boolean } = {};
      if (input.role) patch.role = input.role;
      if (typeof input.isActive === "boolean") patch.is_active = input.isActive;
      const { error } = await supabase
        .from("memberships")
        .update(patch)
        .eq("account_id", accountId)
        .eq("user_id", input.userId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: teamKey(accountId) }),
  });
}

// ---------------------------------------------------------------- convites

export type Invite = Pick<
  Tables<"invites">,
  "id" | "email" | "role" | "token" | "expires_at" | "created_at"
>;

function invitesKey(accountId: string) {
  return ["invites", accountId] as const;
}

export function usePendingInvites(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: invitesKey(accountId),
    enabled,
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, role, token, expires_at, created_at")
        .eq("account_id", accountId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateInvite(accountId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: Exclude<Role, "owner"> }): Promise<Invite> => {
      const { data, error } = await supabase
        .from("invites")
        .insert({
          account_id: accountId,
          email: input.email,
          role: input.role,
          created_by: userId ?? null,
        })
        .select("id, email, role, token, expires_at, created_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invitesKey(accountId) }),
  });
}

export function useRevokeInvite(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from("invites")
        .delete()
        .eq("account_id", accountId)
        .eq("id", inviteId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: invitesKey(accountId) }),
  });
}

export function inviteLink(token: string): string {
  return `${window.location.origin}/convite/${token}`;
}

// ---------------------------------------------------------------- conta

export function useUpdateAccount(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; timezone: string }) => {
      const { error } = await supabase
        .from("accounts")
        .update({ name: input.name, timezone: input.timezone })
        .eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  });
}

function asRecord(v: Json | undefined): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

// Lê o settings atual do banco e mescla, para não apagar chaves que outra tela gravou.
export async function patchAccountSettings(
  accountId: string,
  patch: (current: Record<string, Json | undefined>) => Record<string, Json | undefined>,
): Promise<void> {
  const { data, error } = await supabase
    .from("accounts")
    .select("settings")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  const next = patch(asRecord(data.settings));
  const { error: upErr } = await supabase
    .from("accounts")
    .update({ settings: next })
    .eq("id", accountId);
  if (upErr) throw upErr;
}

export type AutomationSettings = Required<
  Pick<AccountSettings, "auto_classify" | "auto_deal" | "auto_deal_min_score">
>;

export function useUpdateAutomation(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutomationSettings) =>
      patchAccountSettings(accountId, (cur) => ({ ...cur, ...input })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  });
}

// ---------------------------------------------------------------- consumo de IA

export interface LlmUsage {
  total: number;
  errors: number;
  sampled: number;
  byPurpose: { purpose: string; calls: number; errors: number }[];
}

const PAGE = 1000;
const MAX_PAGES = 20;

// PostgREST corta em 1.000 linhas sem avisar: os totais vêm de count exato e a divisão por
// finalidade pagina até 20 mil chamadas (a tela diz quando a amostra não cobre tudo).
export function useLlmUsage(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["llm-usage", accountId],
    enabled,
    queryFn: async (): Promise<LlmUsage> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const base = () =>
        supabase
          .from("llm_calls")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .gte("created_at", since);
      const [totalRes, errRes] = await Promise.all([base(), base().eq("ok", false)]);
      if (totalRes.error) throw totalRes.error;
      if (errRes.error) throw errRes.error;

      const groups = new Map<string, { calls: number; errors: number }>();
      let sampled = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await supabase
          .from("llm_calls")
          .select("purpose, ok")
          .eq("account_id", accountId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        for (const row of data ?? []) {
          const g = groups.get(row.purpose) ?? { calls: 0, errors: 0 };
          groups.set(row.purpose, { calls: g.calls + 1, errors: g.errors + (row.ok ? 0 : 1) });
        }
        sampled += data?.length ?? 0;
        if ((data?.length ?? 0) < PAGE) break;
      }
      return {
        total: totalRes.count ?? 0,
        errors: errRes.count ?? 0,
        sampled,
        byPurpose: [...groups.entries()]
          .map(([purpose, g]) => ({ purpose, ...g }))
          .sort((a, b) => b.calls - a.calls),
      };
    },
  });
}
