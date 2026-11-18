import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

import type { BoardDeal, DealContact, DealNextStep, DealRow, Pipeline, Stage } from "./types";
import { stageKind } from "./types";

const PAGE = 1000;

export const crmKeys = {
  pipelines: (accountId: string) => ["pipelines", accountId] as const,
  stages: (accountId: string, pipelineId: string) =>
    ["pipeline_stages", accountId, pipelineId] as const,
  deals: (accountId: string, pipelineId: string) => ["deals", accountId, pipelineId] as const,
  dealsAll: (accountId: string) => ["deals", accountId] as const,
  activities: (accountId: string, dealId: string) =>
    ["activities", accountId, "deal", dealId] as const,
};

// ---------------------------------------------------------------- funis e etapas

export function usePipelines(accountId: string) {
  return useQuery({
    queryKey: crmKeys.pipelines(accountId),
    queryFn: async (): Promise<Pipeline[]> => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("account_id", accountId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStages(accountId: string, pipelineId: string | null) {
  return useQuery({
    queryKey: crmKeys.stages(accountId, pipelineId ?? ""),
    enabled: Boolean(pipelineId),
    queryFn: async (): Promise<Stage[]> => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("account_id", accountId)
        .eq("pipeline_id", pipelineId ?? "")
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------- negócios

async function fetchContacts(accountId: string, ids: string[]): Promise<Map<string, DealContact>> {
  const map = new Map<string, DealContact>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, name, source, avatar_url, score, temperature, company")
      .eq("account_id", accountId)
      .in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const c of data ?? []) map.set(c.id, c);
  }
  return map;
}

const CHUNK = 200;

async function fetchCompanyNames(accountId: string, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .eq("account_id", accountId)
      .in("id", ids.slice(i, i + CHUNK));
    if (error) throw error;
    for (const c of data ?? []) map.set(c.id, c.name);
  }
  return map;
}

// Chance de fechar por contato (modelo preditivo do SDR). Sem nota, o cartão não mostra nada.
async function fetchWinChances(accountId: string, ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("lead_scores")
      .select("contact_id, score")
      .eq("account_id", accountId)
      .in("contact_id", ids.slice(i, i + CHUNK));
    if (error) throw error;
    for (const r of data ?? []) if (typeof r.score === "number") map.set(r.contact_id, r.score);
  }
  return map;
}

// Próxima tarefa pendente de cada negócio aberto (ordem por prazo; a primeira de cada um vence).
async function fetchNextSteps(
  accountId: string,
  dealIds: string[],
): Promise<Map<string, DealNextStep>> {
  const map = new Map<string, DealNextStep>();
  for (let i = 0; i < dealIds.length; i += CHUNK) {
    const chunk = dealIds.slice(i, i + CHUNK);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("activities")
        .select("deal_id, title, due_at")
        .eq("account_id", accountId)
        .in("deal_id", chunk)
        .is("done_at", null)
        .not("due_at", "is", null)
        .order("due_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      for (const a of data ?? []) {
        if (a.deal_id && a.due_at && !map.has(a.deal_id))
          map.set(a.deal_id, { title: a.title, dueAt: a.due_at });
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return map;
}

// Lê o funil inteiro paginando de 1000 em 1000 (o PostgREST corta sem avisar).
export function useBoardDeals(accountId: string, pipelineId: string | null) {
  return useQuery({
    queryKey: crmKeys.deals(accountId, pipelineId ?? ""),
    enabled: Boolean(pipelineId),
    queryFn: async (): Promise<BoardDeal[]> => {
      const rows: DealRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from("deals")
          .select("*")
          .eq("account_id", accountId)
          .eq("pipeline_id", pipelineId ?? "")
          .order("position", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      const contactIds = [
        ...new Set(rows.map((d) => d.contact_id).filter((id): id is string => Boolean(id))),
      ];
      const companyIds = [
        ...new Set(rows.map((d) => d.company_id).filter((id): id is string => Boolean(id))),
      ];
      const openIds = rows.filter((d) => d.status === "open").map((d) => d.id);
      const [contacts, companies, chances, nextSteps] = await Promise.all([
        fetchContacts(accountId, contactIds),
        fetchCompanyNames(accountId, companyIds),
        fetchWinChances(accountId, contactIds),
        fetchNextSteps(accountId, openIds),
      ]);
      return rows.map((d) => {
        const contact = d.contact_id ? (contacts.get(d.contact_id) ?? null) : null;
        return {
          ...d,
          contact,
          companyName:
            (d.company_id ? companies.get(d.company_id) : undefined) ?? contact?.company ?? null,
          winChance: d.contact_id ? (chances.get(d.contact_id) ?? null) : null,
          nextStep: nextSteps.get(d.id) ?? null,
        };
      });
    },
  });
}

// Qualquer mudança em negócios da conta (outro vendedor, IA, automação) recarrega o quadro.
export function useDealsRealtime(accountId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`deals:${accountId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `account_id=eq.${accountId}` },
        () => {
          if (qc.isMutating({ mutationKey: ["deals", "move"] }) > 0) return;
          void qc.invalidateQueries({ queryKey: crmKeys.dealsAll(accountId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [accountId, qc]);
}

export interface MoveDealInput {
  dealId: string;
  stage: Stage;
  position: number;
  lostReason?: string | undefined;
}

export function useMoveDeal(accountId: string, pipelineId: string) {
  const qc = useQueryClient();
  const key = crmKeys.deals(accountId, pipelineId);
  return useMutation({
    mutationKey: ["deals", "move"],
    mutationFn: async ({ dealId, stage, position, lostReason }: MoveDealInput) => {
      const patch: TablesUpdate<"deals"> = { stage_id: stage.id, position };
      if (stageKind(stage) === "lost") patch.lost_reason = lostReason ?? null;
      const { error } = await supabase
        .from("deals")
        .update(patch)
        .eq("id", dealId)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onMutate: async ({ dealId, stage, position, lostReason }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BoardDeal[]>(key);
      const now = new Date().toISOString();
      qc.setQueryData<BoardDeal[]>(key, (old) =>
        old?.map((d) => {
          if (d.id !== dealId) return d;
          const changedStage = d.stage_id !== stage.id;
          const kind = stageKind(stage);
          return {
            ...d,
            stage_id: stage.id,
            position,
            status: kind,
            lost_reason: kind === "lost" ? (lostReason ?? null) : d.lost_reason,
            updated_at: changedStage ? now : d.updated_at,
          };
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

function invalidateDeals(qc: QueryClient, accountId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: crmKeys.dealsAll(accountId) }),
    qc.invalidateQueries({ queryKey: ["contacts", accountId] }),
  ]);
}

export function useCreateDeal(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: Omit<TablesInsert<"deals">, "account_id">) => {
      const { data, error } = await supabase
        .from("deals")
        .insert({ ...draft, account_id: accountId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => invalidateDeals(qc, accountId),
  });
}

export function useUpdateDeal(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"deals"> }) => {
      const { error } = await supabase
        .from("deals")
        .update(patch)
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: (_d, { id }) =>
      Promise.all([
        invalidateDeals(qc, accountId),
        qc.invalidateQueries({ queryKey: crmKeys.activities(accountId, id) }),
      ]),
  });
}

export function useDeleteDeal(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("deals")
        .delete()
        .eq("id", id)
        .eq("account_id", accountId);
      if (error) throw error;
    },
    onSuccess: () => invalidateDeals(qc, accountId),
  });
}

// ---------------------------------------------------------------- atividades do negócio

export function useDealActivities(accountId: string, dealId: string | null) {
  return useQuery({
    queryKey: crmKeys.activities(accountId, dealId ?? ""),
    enabled: Boolean(dealId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id, type, title, body, created_at, user_id")
        .eq("account_id", accountId)
        .eq("deal_id", dealId ?? "")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddDealNote(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      dealId: string;
      contactId: string | null;
      body: string;
      userId: string;
    }) => {
      const { error } = await supabase.from("activities").insert({
        account_id: accountId,
        deal_id: input.dealId,
        contact_id: input.contactId,
        type: "note",
        title: "Nota",
        body: input.body,
        user_id: input.userId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { dealId }) =>
      qc.invalidateQueries({ queryKey: crmKeys.activities(accountId, dealId) }),
  });
}

// ---------------------------------------------------------------- configuração do funil

export interface StageDraft {
  id: string | null;
  name: string;
  color: string;
  probability: number;
  kind: string;
}

export function useSaveStages(accountId: string, pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ drafts, removed }: { drafts: StageDraft[]; removed: string[] }) => {
      for (const id of removed) {
        const { error } = await supabase
          .from("pipeline_stages")
          .delete()
          .eq("id", id)
          .eq("account_id", accountId);
        if (error) throw new Error(`Não deu para remover a etapa: ${error.message}`);
      }
      for (const [position, s] of drafts.entries()) {
        const fields = {
          name: s.name.trim(),
          color: s.color,
          probability: s.probability,
          kind: s.kind,
          position,
        };
        const { error } = s.id
          ? await supabase
              .from("pipeline_stages")
              .update(fields)
              .eq("id", s.id)
              .eq("account_id", accountId)
          : await supabase
              .from("pipeline_stages")
              .insert({ ...fields, account_id: accountId, pipeline_id: pipelineId });
        if (error) throw error;
      }
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: crmKeys.stages(accountId, pipelineId) }),
        qc.invalidateQueries({ queryKey: crmKeys.deals(accountId, pipelineId) }),
      ]),
  });
}

const DEFAULT_STAGES: Array<Omit<StageDraft, "id">> = [
  { name: "Novo lead", color: "sky", probability: 10, kind: "open" },
  { name: "Qualificado", color: "violet", probability: 30, kind: "open" },
  { name: "Proposta", color: "amber", probability: 60, kind: "open" },
  { name: "Negociação", color: "orange", probability: 80, kind: "open" },
  { name: "Ganho", color: "emerald", probability: 100, kind: "won" },
  { name: "Perdido", color: "rose", probability: 0, kind: "lost" },
];

export function useCreatePipeline(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, position }: { name: string; position: number }) => {
      const { data, error } = await supabase
        .from("pipelines")
        .insert({ account_id: accountId, name: name.trim(), position })
        .select("id")
        .single();
      if (error) throw error;
      const { error: sErr } = await supabase.from("pipeline_stages").insert(
        DEFAULT_STAGES.map((s, i) => ({
          ...s,
          position: i,
          account_id: accountId,
          pipeline_id: data.id,
        })),
      );
      if (sErr) throw sErr;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: crmKeys.pipelines(accountId) }),
  });
}
