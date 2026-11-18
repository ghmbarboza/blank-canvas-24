// Dados da tela Regras de pós-venda. Não há motor próprio: cada regra é uma automação comum
// (tabela automations, template_key "posvenda:<chave>") ligada e pausada pela API de automações.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  automationKeys,
  useAutomationAction,
  useAutomations,
  useSaveAutomation,
  type Automation,
  type AutomationStats,
} from "@/features/automations/api";
import { patchAccountSettings } from "@/features/settings/api";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_QUERY_KEY } from "@/lib/account";

import { AT_RISK_STAGE, findStage } from "./journey";
import {
  RULE_KEYS,
  buildRuleAutomation,
  ruleKeyOf,
  withDailyCap,
  withRuleFlag,
  type RuleKey,
  type RuleOptions,
} from "./rules";

export type RuleRow = Automation & { stats: AutomationStats };

/** A automação de cada regra (a ligada primeiro; senão a mais recente). */
export function rowsByRule(rows: readonly RuleRow[]): Partial<Record<RuleKey, RuleRow>> {
  const out: Partial<Record<RuleKey, RuleRow>> = {};
  for (const a of rows) {
    const key = ruleKeyOf(a.template_key);
    if (!key) continue;
    const cur = out[key];
    if (!cur || (a.status === "active" && cur.status !== "active")) out[key] = a;
  }
  return out;
}

export function useRuleRows(accountId: string) {
  const list = useAutomations(accountId);
  return { ...list, byRule: rowsByRule(list.data ?? []) };
}

/** Etapa "Em risco" do funil padrão (a regra Cliente parado move o cartão para lá). */
export function useAtRiskStage(accountId: string) {
  return useQuery({
    queryKey: ["posvenda", "at-risk-stage", accountId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, pipelines!inner(is_default)")
        .eq("account_id", accountId)
        .eq("pipelines.is_default", true);
      if (error) throw error;
      const hit = findStage(data ?? [], AT_RISK_STAGE);
      return hit ? { id: hit.id, name: hit.name } : null;
    },
  });
}

/** Há WhatsApp conectado? Sem ele as regras ficam ligadas, mas nada sai. */
export function useWhatsAppConnected(accountId: string) {
  return useQuery({
    queryKey: ["posvenda", "whatsapp", accountId],
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("platform", "whatsapp")
        .eq("status", "connected");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

function specValues(key: RuleKey, opts: RuleOptions) {
  const s = buildRuleAutomation(key, opts);
  return {
    name: s.name,
    description: s.description,
    kind: s.kind,
    trigger: s.trigger,
    graph: s.graph,
    exit_rules: s.exit_rules,
    guards: s.guards,
    reentry: s.reentry,
    template_key: s.template_key,
  };
}

export interface ToggleInput {
  key: RuleKey;
  on: boolean;
  /** Automação atual da regra, se já existe. */
  row: RuleRow | undefined;
  /** Mensagem e prazo que estão na tela (usados só quando a regra ainda não existe). */
  opts: RuleOptions;
  /** Estado de todas as regras antes do clique (vai para accounts.settings.posvenda.rules). */
  current: Partial<Record<RuleKey, boolean>>;
}

/** Liga ou desliga a regra: cria a automação se faltar, ativa/pausa e grava o resumo no settings. */
export function useToggleRule(accountId: string) {
  const qc = useQueryClient();
  const save = useSaveAutomation(accountId);
  const action = useAutomationAction(accountId);
  return useMutation({
    mutationFn: async (p: ToggleInput) => {
      let id = p.row?.id;
      if (p.on) {
        if (!id)
          id = (await save.mutateAsync({ ...specValues(p.key, p.opts), status: "draft" })).id;
        await action.mutateAsync({ action: "activate", automationId: id });
      } else if (id) {
        await action.mutateAsync({ action: "pause", automationId: id });
      }
      // Contrato com o onboarding: o resumo no settings reflete o estado real de TODAS as regras.
      await patchAccountSettings(accountId, (cur) => {
        let next = cur as Record<string, unknown>;
        for (const k of RULE_KEYS)
          next = withRuleFlag(next, k, k === p.key ? p.on : p.current[k] === true);
        return next as typeof cur;
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: automationKeys.all(accountId) });
      void qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY });
    },
  });
}

/** Grava a mensagem e o prazo. A regra ligada continua ligada; quem já está no meio segue o texto novo. */
export function useSaveRule(accountId: string) {
  const save = useSaveAutomation(accountId);
  return useMutation({
    mutationFn: async (p: { key: RuleKey; row: RuleRow | undefined; opts: RuleOptions }) => {
      const v = specValues(p.key, p.opts);
      if (p.row) {
        await save.mutateAsync({
          id: p.row.id,
          name: p.row.name,
          trigger: v.trigger,
          graph: v.graph,
        });
      } else {
        await save.mutateAsync({ ...v, status: "draft" });
      }
    },
  });
}

export function useSaveDailyCap(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cap: number) =>
      patchAccountSettings(
        accountId,
        (cur) => withDailyCap(cur as Record<string, unknown>, cap) as typeof cur,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  });
}
