import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/lib/account";

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

const num = z.coerce.number().catch(0);
const numOrNull = z.coerce.number().nullable().catch(null);

const kpisSchema = z.object({
  messages_in: num,
  messages_in_prev: num,
  messages_out: num,
  messages_out_prev: num,
  conversations: num,
  conversations_prev: num,
  new_leads: num,
  new_leads_prev: num,
  hot_leads: num,
  frt_avg: numOrNull,
  frt_avg_prev: numOrNull,
  frt_median: numOrNull,
  frt_sla_pct: numOrNull,
  ai_answered: num,
  pipeline_value: num,
  pipeline_count: num,
  pipeline_potential: num,
  items_deals: num,
  forecast_value: num,
  won_value: num,
  won_value_prev: num,
  won_count: num,
  lost_count: num,
  open_conversations: num,
  unread: num,
  waiting: num,
  oldest_waiting_at: z.string().nullable().catch(null),
  classified: num,
  avg_score: numOrNull,
});

const schema = z.object({
  days: num,
  kpis: kpisSchema,
  daily: z
    .array(z.object({ day: z.string(), in: num, out: num, leads: num, frt: numOrNull }))
    .catch([]),
  heatmap: z.array(z.object({ dow: num, hour: num, n: num })).catch([]),
  channels: z
    .array(
      z.object({
        platform: z.string(),
        in: num,
        out: num,
        total: num,
        conversations: num,
        frt: numOrNull,
      }),
    )
    .catch([]),
  funnel: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.string(),
        position: num,
        probability: num,
        count: num,
        value: num,
      }),
    )
    .catch([]),
  team: z
    .array(
      z.object({
        user_id: z.string(),
        name: z.string().catch("Sem nome"),
        avatar_url: z.string().nullable().catch(null),
        role: z.string().catch("agent"),
        open_conversations: num,
        replies: num,
        frt: numOrNull,
        won_count: num,
        won_value: num,
      }),
    )
    .catch([]),
  temperature: z
    .object({ hot: num, warm: num, cold: num, unclassified: num })
    .catch({ hot: 0, warm: 0, cold: 0, unclassified: 0 }),
});

export type Gerencial = z.infer<typeof schema>;
export type GerencialKpis = Gerencial["kpis"];
export type DailyRow = Gerencial["daily"][number];
export type FunnelStage = Gerencial["funnel"][number];
export type TeamMember = Gerencial["team"][number];
export type ChannelRow = Gerencial["channels"][number];

export function useGerencial(days: Period) {
  const accountId = useAccountId();
  return useQuery({
    queryKey: ["dashboard", accountId, "gerencial", days],
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Gerencial> => {
      const { data, error } = await supabase.rpc(
        "dashboard_gerencial" as never,
        {
          _account: accountId,
          _days: days,
        } as never,
      );
      if (error) throw error;
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new Error("Resposta inesperada do painel");
      return parsed.data;
    },
  });
}

// Conta sem nenhum movimento: o painel mostra o exemplo em vez de uma tela de zeros.
export function isEmptyAccount(g: Gerencial | undefined): boolean {
  if (!g) return false;
  const k = g.kpis;
  return (
    k.messages_in + k.messages_out + k.pipeline_count + k.won_count + k.new_leads === 0 &&
    g.temperature.hot + g.temperature.warm + g.temperature.cold + g.temperature.unclassified === 0
  );
}

// Variação percentual contra o período anterior; null quando não há base de comparação.
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rest = s % 60;
    return rest ? `${m} min ${String(rest).padStart(2, "0")} s` : `${m} min`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm} min` : `${h} h`;
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "Dono",
  admin: "Administrador",
  manager: "Gestor",
  agent: "Atendente",
  seller: "Vendedor",
};
