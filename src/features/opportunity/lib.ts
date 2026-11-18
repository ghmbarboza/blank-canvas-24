import type { Tables } from "@/integrations/supabase/types";

export type DealItem = Tables<"deal_items">;
export type ItemKind = "core" | "upsell" | "cross_sell";
export type ItemStatus = "suggested" | "accepted" | "declined";

export const KIND_LABEL: Record<ItemKind, string> = {
  core: "Principal",
  upsell: "Plano maior",
  cross_sell: "Item complementar",
};

export interface Totals {
  accepted: number;
  suggested: number;
  potential: number;
  upsell: number;
  crossSell: number;
}

// Mesma regra do banco: aceitos somam o valor; sugestões abertas somam o potencial.
export function totals(items: Pick<DealItem, "status" | "kind" | "line_total">[]): Totals {
  let accepted = 0;
  let suggested = 0;
  let upsell = 0;
  let crossSell = 0;
  for (const i of items) {
    const v = Number(i.line_total) || 0;
    if (i.status === "accepted") accepted += v;
    if (i.status === "suggested") suggested += v;
    if (i.status !== "declined" && i.kind === "upsell") upsell += v;
    if (i.status !== "declined" && i.kind === "cross_sell") crossSell += v;
  }
  return { accepted, suggested, potential: accepted + suggested, upsell, crossSell };
}

export type StepState = "done" | "current" | "todo";

export interface JourneyInput {
  replied: boolean;
  classified: boolean;
  interests: number;
  items: number;
}

export interface JourneyStep {
  key: "atender" | "qualificar" | "interesse" | "oportunidade";
  label: string;
  state: StepState;
}

// Atender → qualificar → entender o interesse → estimar a oportunidade. A primeira etapa não cumprida é a atual.
export function journey(input: JourneyInput): JourneyStep[] {
  const done = [input.replied, input.classified, input.interests > 0, input.items > 0];
  const labels: [JourneyStep["key"], string][] = [
    ["atender", "Atender"],
    ["qualificar", "Qualificar"],
    ["interesse", "Interesse"],
    ["oportunidade", "Oportunidade"],
  ];
  const firstOpen = done.findIndex((d) => !d);
  return labels.map(([key, label], i) => ({
    key,
    label,
    state: done[i] ? "done" : i === firstOpen ? "current" : "todo",
  }));
}
