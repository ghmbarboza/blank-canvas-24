import type { Tables } from "@/integrations/supabase/types";

export type Pipeline = Tables<"pipelines">;
export type Stage = Tables<"pipeline_stages">;
export type DealRow = Tables<"deals">;

export type StageKind = "open" | "won" | "lost";

export interface DealContact {
  id: string;
  name: string | null;
  source: string | null;
  avatar_url: string | null;
  score: number | null;
  temperature: string | null;
  company: string | null;
}

export interface DealNextStep {
  title: string;
  dueAt: string;
}

export interface BoardDeal extends DealRow {
  contact: DealContact | null;
  /** Nome da empresa vinculada ao negócio (ou a do contato). */
  companyName: string | null;
  /** Chance de fechar aprendida pela IA (lead_scores), 0–100; null quando ainda não há nota. */
  winChance: number | null;
  /** Próxima tarefa pendente do negócio (a mais antiga, inclusive atrasada). */
  nextStep: DealNextStep | null;
}

export type TemperatureFilter = "all" | "hot" | "warm" | "cold";

export interface DealFilters {
  owner: "all" | "mine";
  temperature: TemperatureFilter;
  search: string;
}

export const DEFAULT_DEAL_FILTERS: DealFilters = { owner: "all", temperature: "all", search: "" };

export function stageKind(stage: Pick<Stage, "kind"> | undefined): StageKind {
  const k = stage?.kind;
  return k === "won" || k === "lost" ? k : "open";
}
