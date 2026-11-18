// Piloto automático (motor Agents SDK): o liga/desliga por conta e a fila de aprovações.
// A fila vem do banco com RLS e se atualiza em tempo real; a decisão passa pelo servidor,
// que confere o papel de quem clicou e retoma a rodada de onde parou.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_QUERY_KEY, useAccount } from "@/lib/account";

import { agentsApi } from "../api";

export interface Approval {
  id: string;
  conversation_id: string | null;
  agent_id: string | null;
  tool: string;
  summary: string;
  created_at: string;
  ai_agents: { name: string } | null;
}

export const approvalKeys = {
  pending: (a: string) => ["agent-approvals", a, "pending"] as const,
};

/** Aprovações esperando o gestor, com tempo real (um canal por tela que mostra a fila). */
export function usePendingApprovals(accountId: string, channelName: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: approvalKeys.pending(accountId),
    queryFn: async (): Promise<Approval[]> => {
      const { data, error } = await supabase
        .from("agent_approvals")
        .select(
          "id, conversation_id, agent_id, tool, summary, created_at, ai_agents!agent_approvals_agent_id_fkey(name)",
        )
        .eq("account_id", accountId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Approval[];
    },
  });
  useEffect(() => {
    const channel = supabase
      .channel(`approvals-${channelName}-${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_approvals",
          filter: `account_id=eq.${accountId}`,
        },
        () => void qc.invalidateQueries({ queryKey: approvalKeys.pending(accountId) }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, channelName, qc]);
  return query;
}

export interface DecideResult {
  reply: string;
  action: string;
  agent: string | null;
}

export function useDecideApproval(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { approvalId: string; decision: "approve" | "reject" }) =>
      agentsApi<DecideResult>(accountId, "approval.decide", p),
    onSettled: () => qc.invalidateQueries({ queryKey: approvalKeys.pending(accountId) }),
  });
}

export type Engine = "agents_sdk" | "classic";

export function useEngine(): Engine {
  const { current } = useAccount();
  const ai = (current?.settings as { ai?: { engine?: string } } | undefined)?.ai;
  return ai?.engine === "agents_sdk" ? "agents_sdk" : "classic";
}

export function useSetEngine(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (engine: Engine) =>
      agentsApi<{ engine: Engine }>(accountId, "engine.set", { engine }),
    onSettled: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  });
}
