import { useCallback, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  ACCOUNT_QUERY_KEY,
  AccountContext,
  type AccountMembership,
  type AccountSettings,
  type AccountState,
} from "@/lib/account";
import { useAuth } from "@/lib/auth";

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [...ACCOUNT_QUERY_KEY, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) throw new Error("Entre para acessar sua empresa");
      const [{ data: rows, error }, { data: profile }] = await Promise.all([
        supabase
          .from("memberships")
          .select("account_id, role, accounts(name, timezone, settings)")
          .eq("user_id", user.id)
          .eq("is_active", true),
        supabase.from("profiles").select("last_account_id").eq("id", user.id).maybeSingle(),
      ]);
      if (error) throw error;
      const memberships: AccountMembership[] = (rows ?? []).map((r) => {
        const acc = r.accounts as unknown as {
          name: string;
          timezone: string;
          settings: AccountSettings;
        };
        return {
          accountId: r.account_id,
          accountName: acc?.name ?? "Conta",
          role: r.role,
          timezone: acc?.timezone ?? "America/Sao_Paulo",
          settings: acc?.settings ?? {},
        };
      });
      return { memberships, lastAccountId: profile?.last_account_id ?? null };
    },
  });

  const memberships = useMemo(() => data?.memberships ?? [], [data]);
  const current =
    memberships.find((m) => m.accountId === data?.lastAccountId) ?? memberships[0] ?? null;

  const switchAccount = useCallback(
    async (accountId: string) => {
      if (!user) return;
      await supabase.from("profiles").upsert({ id: user.id, last_account_id: accountId });
      // Troca de conta invalida tudo: nenhum dado de uma conta pode aparecer na outra.
      await queryClient.resetQueries();
    },
    [user, queryClient],
  );

  const value = useMemo<AccountState>(
    () => ({
      memberships,
      current,
      loading: isLoading,
      switchAccount,
      isManager: current ? ["owner", "admin", "manager"].includes(current.role) : false,
      isAdmin: current ? ["owner", "admin"].includes(current.role) : false,
    }),
    [memberships, current, isLoading, switchAccount],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
