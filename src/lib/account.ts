import { createContext, useContext } from "react";

import type { Enums } from "@/integrations/supabase/types";

export type Role = Enums<"app_role">;

export interface AccountMembership {
  accountId: string;
  accountName: string;
  role: Role;
  timezone: string;
  settings: AccountSettings;
}

export interface AccountSettings {
  auto_classify?: boolean;
  auto_deal?: boolean;
  auto_deal_min_score?: number;
  ai?: { provider?: string; model?: string };
  /** Teto mensal de IA da conta, em dólar (R9). Sem valor: padrão da plataforma; 0 desliga a IA. */
  ai_budget?: { monthly_usd?: number };
  /** Recursos extras ligados em Ajustes › Recursos extras (o núcleo da central está sempre ligado). */
  modules?: string[];
}

export interface AccountState {
  memberships: AccountMembership[];
  current: AccountMembership | null;
  loading: boolean;
  switchAccount: (accountId: string) => Promise<void>;
  isManager: boolean;
  isAdmin: boolean;
}

export const AccountContext = createContext<AccountState | null>(null);

export const ACCOUNT_QUERY_KEY = ["memberships"] as const;

export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount fora do AccountProvider");
  return ctx;
}

// Atalho para telas que só existem com conta ativa (dentro do layout autenticado).
export function useAccountId(): string {
  const { current } = useAccount();
  if (!current) throw new Error("Sem conta ativa");
  return current.accountId;
}
