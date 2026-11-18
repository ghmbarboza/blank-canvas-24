// Hooks da equipe de IA. Leitura e edição simples vão direto ao banco (RLS por conta); criar,
// simular, avaliar, Composio e "Pergunte ao Vínculo" passam pela rota /api/agents.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { callApi } from "@/lib/api";

export type Agent = Tables<"ai_agents">;
export type AgentTool = Tables<"agent_tools">;
export type AgentEval = Tables<"agent_evals">;
export type EvalRun = Tables<"agent_eval_runs">;
export type ComposioConnection = Tables<"composio_connections">;
export type SupervisorFlag = Tables<"supervisor_flags">;

export const agentKeys = {
  all: (a: string) => ["agents", a] as const,
  list: (a: string) => ["agents", a, "list"] as const,
  tools: (a: string) => ["agents", a, "tools"] as const,
  evals: (a: string, id: string) => ["agents", a, "evals", id] as const,
  runs: (a: string, id: string) => ["agents", a, "runs", id] as const,
  overview: (a: string) => ["agents", a, "overview"] as const,
  flags: (a: string) => ["agents", a, "flags"] as const,
  composio: (a: string) => ["agents", a, "composio"] as const,
  estimate: (a: string, id: string) => ["agents", a, "estimate", id] as const,
  questions: (a: string) => ["agents", a, "questions"] as const,
};

export function useAgents(accountId: string) {
  return useQuery({
    queryKey: agentKeys.list(accountId),
    queryFn: async (): Promise<Agent[]> => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("account_id", accountId)
        .order("is_entry", { ascending: false })
        .order("priority")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAgentTools(accountId: string) {
  return useQuery({
    queryKey: agentKeys.tools(accountId),
    queryFn: async (): Promise<AgentTool[]> => {
      const { data, error } = await supabase
        .from("agent_tools")
        .select("*")
        .eq("account_id", accountId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface Overview {
  agents: Record<
    string,
    {
      replied: number;
      handoff: number;
      tools: number;
      last_eval: { pass_rate: number | null; version: number; at: string; status: string } | null;
    }
  >;
  silent_open: number;
  flags_open: number;
  handoffs_human: number;
  handoffs_with_owner: number;
}

export function useOverview(accountId: string) {
  return useQuery({
    queryKey: agentKeys.overview(accountId),
    queryFn: async (): Promise<Overview> => {
      const { data, error } = await supabase.rpc("agents_overview", {
        _account: accountId,
        _days: 7,
      });
      if (error) throw error;
      return data as unknown as Overview;
    },
    refetchInterval: 60_000,
  });
}

export function useFlags(accountId: string) {
  return useQuery({
    queryKey: agentKeys.flags(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supervisor_flags")
        .select("*, conversations(title)")
        .eq("account_id", accountId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as (SupervisorFlag & {
        conversations: { title: string | null } | null;
      })[];
    },
    refetchInterval: 60_000,
  });
}

export function useResolveFlag(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supervisor_flags")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all(accountId) }),
  });
}

export function useAgentEvals(accountId: string, agentId: string) {
  return useQuery({
    queryKey: agentKeys.evals(accountId, agentId),
    queryFn: async (): Promise<AgentEval[]> => {
      const { data, error } = await supabase
        .from("agent_evals")
        .select("*")
        .eq("account_id", accountId)
        .eq("agent_id", agentId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEvalRuns(accountId: string, agentId: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: agentKeys.runs(accountId, agentId),
    queryFn: async (): Promise<EvalRun[]> => {
      const { data, error } = await supabase
        .from("agent_eval_runs")
        .select("*")
        .eq("account_id", accountId)
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "queued" || r.status === "running")
        ? 4000
        : false,
  });
  const running = (q.data ?? []).some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!running) void qc.invalidateQueries({ queryKey: agentKeys.list(accountId) });
  }, [running, qc, accountId]);
  return q;
}

export function useUpdateAgent(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"ai_agents"> }) => {
      const { error } = await supabase
        .from("ai_agents")
        .update(patch)
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all(accountId) }),
  });
}

export function useDeleteAgent(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_agents")
        .delete()
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all(accountId) }),
  });
}

export function useToggleTool(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      agentId: string;
      kind: "internal" | "composio";
      slug: string;
      on: boolean;
      config?: Record<string, unknown>;
    }) => {
      if (p.on) {
        const { error } = await supabase.from("agent_tools").upsert(
          {
            account_id: accountId,
            agent_id: p.agentId,
            kind: p.kind,
            slug: p.slug,
            enabled: true,
            config: (p.config ?? {}) as never,
          },
          { onConflict: "agent_id,kind,slug" },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("agent_tools")
          .delete()
          .eq("account_id", accountId)
          .eq("agent_id", p.agentId)
          .eq("kind", p.kind)
          .eq("slug", p.slug);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all(accountId) }),
  });
}

export function useSaveEval(accountId: string, agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: {
      id?: string;
      question: string;
      expected: string;
      must_handoff: boolean;
    }) => {
      if (c.id) {
        const { error } = await supabase
          .from("agent_evals")
          .update({ question: c.question, expected: c.expected, must_handoff: c.must_handoff })
          .eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("agent_evals").insert({
          account_id: accountId,
          agent_id: agentId,
          kind: c.must_handoff ? "handoff" : "custom",
          question: c.question,
          expected: c.expected,
          must_handoff: c.must_handoff,
          source: "manual",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.evals(accountId, agentId) }),
  });
}

export function useDeleteEval(accountId: string, agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agent_evals")
        .delete()
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.evals(accountId, agentId) }),
  });
}

// ───────────────────────── rota /api/agents ─────────────────────────
export function agentsApi<T>(
  accountId: string,
  action: string,
  body: Record<string, unknown> = {},
) {
  return callApi<T>("/api/agents", { accountId, action, ...body });
}

export interface Estimate {
  cases: number;
  model: string;
  provider: string;
  usd: number;
  calls: number;
  usesAccountKey: boolean;
}

export function useEstimate(accountId: string, agentId: string, enabled: boolean) {
  return useQuery({
    queryKey: agentKeys.estimate(accountId, agentId),
    queryFn: () => agentsApi<Estimate>(accountId, "eval.estimate", { agentId }),
    enabled,
  });
}

export interface SimResult {
  action: "reply" | "handoff" | "route";
  reply: string;
  reason: string;
  summary: string;
  agent: string;
  handoffs: string[];
  toolsCalled: string[];
  confidence: number;
  ms: number;
  /** motor Agents SDK: a rodada parou esperando o gestor */
  approvalId?: string | null;
  engine?: "agents_sdk";
}

export function useComposioState(accountId: string) {
  return useQuery({
    queryKey: agentKeys.composio(accountId),
    queryFn: async () => {
      const [{ data: settings, error: e1 }, { data: conns, error: e2 }] = await Promise.all([
        supabase.from("composio_settings").select("*").eq("account_id", accountId).maybeSingle(),
        supabase.from("composio_connections").select("*").eq("account_id", accountId),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        settings,
        connections: conns ?? [],
        // a linha nasce quando a chave é salva e testada (o valor fica no Vault, nunca aqui)
        hasKey: !!settings && settings.status !== "pending",
      };
    },
  });
}

export interface AskAnswer {
  answer: string;
  links: { label: string; href: string }[];
  used: string[];
  created: { agentId: string; name: string; cases: number; estimate: Estimate } | null;
}

export function useQuestions(accountId: string) {
  return useQuery({
    queryKey: agentKeys.questions(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nexus_questions")
        .select("id, question, answer, links, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ───────── números do dia e tendência da avaliação (cartões de pessoa) ─────────

const PAGE = 1000; // o PostgREST corta em 1.000 linhas sem avisar: paginamos
const MAX_PAGES = 20;

async function pagedRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface TodayCounts {
  /** conversas distintas que o agente respondeu ou passou adiante hoje */
  attended: Record<string, number>;
  /** passadas para uma pessoa da equipe, hoje, por agente de origem */
  handoffsHuman: Record<string, number>;
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function useTodayCounts(accountId: string) {
  return useQuery({
    queryKey: [...agentKeys.all(accountId), "today"] as const,
    queryFn: async (): Promise<TodayCounts> => {
      const since = startOfToday();
      const [runs, handoffs] = await Promise.all([
        pagedRows<{ agent_id: string | null; conversation_id: string }>((from, to) =>
          supabase
            .from("ai_agent_runs")
            .select("agent_id, conversation_id")
            .eq("account_id", accountId)
            .gte("created_at", since)
            .in("status", ["replied", "handoff"])
            .not("agent_id", "is", null)
            .order("created_at")
            .range(from, to),
        ),
        pagedRows<{ from_agent_id: string | null }>((from, to) =>
          supabase
            .from("agent_handoffs")
            .select("from_agent_id")
            .eq("account_id", accountId)
            .eq("kind", "human")
            .gte("created_at", since)
            .not("from_agent_id", "is", null)
            .order("created_at")
            .range(from, to),
        ),
      ]);
      const seen = new Map<string, Set<string>>();
      for (const r of runs) {
        if (!r.agent_id) continue;
        const set = seen.get(r.agent_id) ?? new Set<string>();
        set.add(r.conversation_id);
        seen.set(r.agent_id, set);
      }
      const attended = Object.fromEntries([...seen].map(([id, s]) => [id, s.size]));
      const handoffsHuman: Record<string, number> = {};
      for (const h of handoffs) {
        if (!h.from_agent_id) continue;
        handoffsHuman[h.from_agent_id] = (handoffsHuman[h.from_agent_id] ?? 0) + 1;
      }
      return { attended, handoffsHuman };
    },
    refetchInterval: 60_000,
  });
}

export interface EvalTrend {
  latest: number;
  previous: number | null;
  version: number;
}

/** Últimas duas avaliações concluídas de cada agente, para mostrar queda. */
export function useEvalTrends(accountId: string) {
  return useQuery({
    queryKey: [...agentKeys.all(accountId), "eval-trends"] as const,
    queryFn: async (): Promise<Record<string, EvalTrend>> => {
      const { data, error } = await supabase
        .from("agent_eval_runs")
        .select("agent_id, pass_rate, agent_version, created_at")
        .eq("account_id", accountId)
        .eq("status", "done")
        .not("pass_rate", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const out: Record<string, EvalTrend> = {};
      for (const r of data ?? []) {
        if (r.pass_rate === null) continue;
        const cur = out[r.agent_id];
        if (!cur)
          out[r.agent_id] = { latest: r.pass_rate, previous: null, version: r.agent_version };
        else if (cur.previous === null) out[r.agent_id] = { ...cur, previous: r.pass_rate };
      }
      return out;
    },
  });
}
