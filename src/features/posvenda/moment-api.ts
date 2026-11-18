// Momento de cada cliente da conta, por id do contato. Junta o que já existe: sinais de saúde
// (features/gestao), as datas e o registro de avaliações que ficam em contacts.custom, os prazos da
// conta e os prazos das regras "Hora de comprar de novo" e "Cliente parado".
import { createContext, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Graph, Trigger } from "@/features/automations/engine";
import { useHealthMap } from "@/features/contacts/customer-health";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAccount } from "@/lib/account";

import {
  DEFAULT_PARADO_DIAS,
  DEFAULT_RECOMPRA_DIAS,
  computeMoment,
  daysBetween,
  dayOfInstant,
  hasOpenComplaint,
  prazosOf,
  purchaseDateOf,
  readsCancelIntent,
  renewalDateOf,
  reviewsOf,
  todayIso,
  type MomentConfig,
  type MomentResult,
  type ReviewEntry,
} from "./moment";
import { readRuleOptions, templateKeyFor } from "./rules";

/** Momentos já calculados por quem desenha muitos cartões (ex.: o quadro da Carteira). */
export const MomentMapContext = createContext<Map<string, MomentResult> | null>(null);

export interface CustomerExtra {
  id: string;
  name: string | null;
  source: string | null;
  tags: string[];
  ai_intent: string | null;
  created_at: string;
  custom: Json;
}

const EXTRAS_LIMIT = 2000;

/** Clientes da conta com o que o momento precisa além da saúde (datas, etiquetas, avaliações). */
export function useCustomerExtras(accountId: string) {
  return useQuery({
    // começa com ["contacts", conta]: qualquer edição de contato atualiza o momento
    queryKey: ["contacts", accountId, "posvenda-extras"],
    staleTime: 60_000,
    queryFn: async (): Promise<CustomerExtra[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, source, tags, ai_intent, created_at, custom")
        .eq("account_id", accountId)
        .eq("lifecycle", "customer")
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .limit(EXTRAS_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Ciclo de recompra e dias de "cliente parado": os mesmos prazos das regras, sem número novo. */
export function useMomentCycles(accountId: string) {
  return useQuery({
    queryKey: ["automations", accountId, "posvenda-cycles"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out = { recompraDias: DEFAULT_RECOMPRA_DIAS, paradoDias: DEFAULT_PARADO_DIAS };
      const { data, error } = await supabase
        .from("automations")
        .select("template_key, trigger, graph, status")
        .eq("account_id", accountId)
        .in("template_key", [templateKeyFor("recompra"), templateKeyFor("cliente_parado")])
        .neq("status", "archived")
        .order("created_at", { ascending: true });
      // quem não pode ler automações fica com o padrão das regras
      if (error) return out;
      for (const a of data ?? []) {
        const row = {
          trigger: a.trigger as unknown as Trigger,
          graph: a.graph as unknown as Graph,
        };
        if (a.template_key === templateKeyFor("recompra"))
          out.recompraDias = readRuleOptions("recompra", row).days ?? out.recompraDias;
        else out.paradoDias = readRuleOptions("cliente_parado", row).days ?? out.paradoDias;
      }
      return out;
    },
  });
}

export function useMomentConfig(accountId: string): MomentConfig {
  const { current } = useAccount();
  const cycles = useMomentCycles(accountId);
  const settings = current?.settings;
  return useMemo(
    () => ({
      prazos: prazosOf(settings),
      recompraDias: cycles.data?.recompraDias ?? DEFAULT_RECOMPRA_DIAS,
      paradoDias: cycles.data?.paradoDias ?? DEFAULT_PARADO_DIAS,
    }),
    [settings, cycles.data],
  );
}

const IMPORTED = /^(import|csv)/;

/** Momento e registro de avaliações de cada cliente da conta. Quem não é cliente fica de fora. */
export function useMomentMap(accountId: string) {
  const health = useHealthMap(accountId);
  const extras = useCustomerExtras(accountId);
  const config = useMomentConfig(accountId);

  const built = useMemo(() => {
    const map = new Map<string, MomentResult>();
    const reviews = new Map<string, ReviewEntry[]>();
    const names = new Map<string, string>();
    const now = Date.now();
    const today = todayIso(now);
    for (const c of extras.data ?? []) {
      const h = health.map.get(c.id);
      const entries = reviewsOf(c.custom);
      if (entries.length) reviews.set(c.id, entries);
      names.set(c.id, c.name ?? "Cliente sem nome");
      const lastDay = dayOfInstant(h?.signals.last_interaction_at);
      map.set(
        c.id,
        computeMoment(
          {
            purchaseDate: purchaseDateOf(c.custom),
            customerSince: h?.signals.customer_since ?? c.created_at,
            imported: IMPORTED.test(c.source ?? ""),
            renewalDate: renewalDateOf(c.custom) ?? h?.signals.next_renewal_at ?? null,
            risk: {
              healthLevel: h?.result.level ?? null,
              npsLast: h?.signals.nps_last ?? null,
              openTickets: h?.signals.open_tickets ?? 0,
              breachedTickets: h?.signals.breached_tickets ?? 0,
              silentDays: lastDay ? daysBetween(lastDay, today) : null,
              openComplaint: hasOpenComplaint(entries),
              cancelIntent: readsCancelIntent(c.ai_intent),
              taggedAtRisk: c.tags.some((t) => t.trim().toLowerCase() === "em risco"),
            },
          },
          config,
          now,
        ),
      );
    }
    return { map, reviews, names };
  }, [extras.data, health.map, config]);

  return {
    ...built,
    config,
    isPending: extras.isPending,
    isError: extras.isError,
    /** Passou do limite da consulta: a contagem cobre só os clientes mais recentes. */
    truncated: (extras.data?.length ?? 0) >= EXTRAS_LIMIT,
  };
}

/**
 * Troca um pedaço de contacts.custom (data da compra, renovação, avaliações) lendo o valor atual
 * antes de gravar, para não apagar o que outra pessoa acabou de salvar em outro campo.
 */
export function usePatchContactCustom(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      contactId: string;
      patch: (custom: unknown) => Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from("contacts")
        .select("custom")
        .eq("id", p.contactId)
        .eq("account_id", accountId)
        .single();
      if (error) throw error;
      const { error: upErr } = await supabase
        .from("contacts")
        .update({ custom: p.patch(data.custom) as Json })
        .eq("id", p.contactId)
        .eq("account_id", accountId);
      if (upErr) throw upErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts", accountId] }),
  });
}
