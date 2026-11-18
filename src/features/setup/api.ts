// Chamadas do passo a passo (formulário e botão): cada uma grava pelo mesmo caminho que a Cris
// usaria e manda reler o roteiro, para o passo virar "feito" na hora.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { agentKeys } from "@/features/agents/api";
import { setupKeys } from "@/features/setup-chat/api";
import { ACCOUNT_QUERY_KEY } from "@/lib/account";
import { callApi } from "@/lib/api";

function refresh(qc: QueryClient, accountId: string) {
  void qc.invalidateQueries({ queryKey: ["setup"] });
  void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
  void qc.invalidateQueries({ queryKey: setupKeys.facts(accountId) });
}

export interface CompanyInput {
  name: string;
  segment: string;
  sells: string;
  tone: string;
}

export function useSaveCompany(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyInput) =>
      callApi<{ ok: boolean }>("/api/setup-chat", { accountId, action: "company", ...input }),
    onSuccess: () => refresh(qc, accountId),
  });
}

export function useSaveKnowledgeText(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; content: string }) =>
      callApi<{ ok: boolean; chunks: number }>("/api/setup-chat", {
        accountId,
        action: "knowledge_text",
        ...input,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: setupKeys.docs(accountId) });
      void qc.invalidateQueries({ queryKey: ["setup"] });
    },
  });
}

export interface AgentStepState {
  agent: { id: string; name: string; status: string; reason: string | null } | null;
  cases: number;
  run: {
    status: string;
    passed: number;
    total: number;
    passRate: number | null;
    error: string | null;
  } | null;
  whatsappOn: number;
}

const agentStepKey = (accountId: string) => ["setup", "agent-step", accountId] as const;

/** A avaliação está na fila ou rodando: a tela confere sozinha até acabar. */
export function isEvaluating(s: AgentStepState | undefined): boolean {
  return s?.run?.status === "queued" || s?.run?.status === "running";
}

export function useAgentStep(accountId: string) {
  return useQuery({
    queryKey: agentStepKey(accountId),
    queryFn: () => callApi<AgentStepState>("/api/setup-chat", { accountId, action: "agent_state" }),
    refetchInterval: (q) => (isEvaluating(q.state.data) ? 4000 : false),
  });
}

function useAgentAction(accountId: string, action: "agent_create" | "agent_activate") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown> = {}) =>
      callApi<AgentStepState>("/api/setup-chat", { accountId, action, ...input }),
    onSuccess: (data) => {
      qc.setQueryData(agentStepKey(accountId), data);
      void qc.invalidateQueries({ queryKey: agentKeys.all(accountId) });
      void qc.invalidateQueries({ queryKey: ["channels", accountId] });
      void qc.invalidateQueries({ queryKey: ["setup", "roteiro"] });
    },
  });
}

export const useCreateAgent = (accountId: string) => useAgentAction(accountId, "agent_create");
export const useActivateAgent = (accountId: string) => useAgentAction(accountId, "agent_activate");
