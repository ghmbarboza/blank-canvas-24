import type { MomentKey } from "@/features/posvenda/moment";
import { normalizePhone } from "@/features/telephony/lib";
import type { SegmentFilter } from "@/features/segments/rules";
import type { Tables } from "@/integrations/supabase/types";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";

export type ContactRow = Tables<"contacts">;

export type Lifecycle = "lead" | "opportunity" | "customer" | "inactive";

export const LIFECYCLES: readonly Lifecycle[] = ["lead", "opportunity", "customer", "inactive"];

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  lead: "Contato (ainda não comprou)",
  opportunity: "Em negociação",
  customer: "Cliente",
  inactive: "Inativo",
};

export function isLifecycle(v: unknown): v is Lifecycle {
  return v === "lead" || v === "opportunity" || v === "customer" || v === "inactive";
}

export function lifecycleLabel(v: string | null | undefined): string {
  return isLifecycle(v) ? LIFECYCLE_LABEL[v] : "—";
}

// Origens que não são rede social (contato criado à mão ou importado).
const SOURCE_LABEL: Record<string, string> = {
  manual: "Cadastro manual",
  csv: "Importação",
  import_csv: "Importação",
};

export function isPlatformSource(source: string | null | undefined): source is string {
  return Boolean(source && PLATFORM_LABEL[source] && !SOURCE_LABEL[source]);
}

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return SOURCE_LABEL[source] ?? PLATFORM_LABEL[source] ?? source;
}

export type TemperatureFilter = "all" | "hot" | "warm" | "cold" | "none";

export interface ContactFilters {
  search: string;
  temperature: TemperatureFilter;
  lifecycle: Lifecycle | "all";
  source: string;
  onlyMine: boolean;
  segment: SegmentFilter | null;
  segmentId: string | null;
  /** Momento do pós-venda (calculado na tela; vira uma lista de ids na consulta). */
  moment: MomentKey | "all";
}

export const DEFAULT_CONTACT_FILTERS: ContactFilters = {
  search: "",
  temperature: "all",
  lifecycle: "all",
  source: "all",
  onlyMine: false,
  segment: null,
  segmentId: null,
  moment: "all",
};

export type ContactSortColumn =
  | "name"
  | "score"
  | "ai_intent"
  | "ai_next_step"
  | "lifecycle"
  | "source"
  | "owner_user_id"
  | "last_interaction_at";

export interface ContactSort {
  column: ContactSortColumn;
  desc: boolean;
}

export const DEFAULT_CONTACT_SORT: ContactSort = { column: "last_interaction_at", desc: true };

export interface TeamMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
}

// Termo de busca seguro para o filtro `or` do PostgREST: vírgula, parênteses, aspas e `*`
// quebram a sintaxe; `%` e `_` viram literais.
export function escapeSearchTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[*,()"'\\]/g, " ")
    .replace(/[%_]/g, (ch) => `\\${ch}`)
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function onlyDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export { normalizePhone };
