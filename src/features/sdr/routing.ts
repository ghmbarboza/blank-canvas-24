// Roteamento de lead (território, segmento, origem, porte e rodízio). Puro: a primeira regra
// ativa que casa decide; dentro dela, um vendedor fixo ou o rodízio pelo cursor.

export interface RoutingMatch {
  states?: string[];
  cities?: string[];
  segments?: string[];
  sources?: string[];
  sizes?: string[];
}

export interface RoutingRule {
  id: string;
  name: string;
  position: number;
  is_active: boolean;
  match: RoutingMatch;
  mode: "user" | "round_robin";
  user_ids: string[];
  rr_cursor: number;
}

export interface LeadInfo {
  state: string | null;
  city: string | null;
  segment: string | null;
  source: string | null;
  size: string | null;
}

const fold = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// DDD → UF (para território quando só há telefone).
const DDD_UF: Record<string, string> = {};
const RANGES: [string, number[]][] = [
  ["SP", [11, 12, 13, 14, 15, 16, 17, 18, 19]],
  ["RJ", [21, 22, 24]],
  ["ES", [27, 28]],
  ["MG", [31, 32, 33, 34, 35, 37, 38]],
  ["PR", [41, 42, 43, 44, 45, 46]],
  ["SC", [47, 48, 49]],
  ["RS", [51, 53, 54, 55]],
  ["DF", [61]],
  ["GO", [62, 64]],
  ["TO", [63]],
  ["MT", [65, 66]],
  ["MS", [67]],
  ["AC", [68]],
  ["RO", [69]],
  ["BA", [71, 73, 74, 75, 77]],
  ["SE", [79]],
  ["PE", [81, 87]],
  ["AL", [82]],
  ["PB", [83]],
  ["RN", [84]],
  ["CE", [85, 88]],
  ["PI", [86, 89]],
  ["PA", [91, 93, 94]],
  ["AM", [92, 97]],
  ["RR", [95]],
  ["AP", [96]],
  ["MA", [98, 99]],
];
for (const [uf, ddds] of RANGES) for (const d of ddds) DDD_UF[String(d)] = uf;

/** UF pelo DDD do telefone (com ou sem 55). */
export function stateFromPhone(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return null;
  return DDD_UF[d.slice(0, 2)] ?? null;
}

function listHit(
  list: string[] | undefined,
  value: string | null,
  partial = false,
): boolean | null {
  const clean = (list ?? []).map(fold).filter(Boolean);
  if (clean.length === 0) return null; // regra não filtra por isto
  const v = fold(value);
  if (!v) return false;
  return clean.some((x) => (partial ? v.includes(x) || x.includes(v) : x === v));
}

/** A regra casa quando TODOS os filtros preenchidos casam. Regra sem filtro casa com qualquer lead. */
export function ruleMatches(rule: RoutingRule, lead: LeadInfo): boolean {
  const checks = [
    listHit(rule.match.states, lead.state),
    listHit(rule.match.cities, lead.city),
    listHit(rule.match.segments, lead.segment, true),
    listHit(rule.match.sources, lead.source),
    listHit(rule.match.sizes, lead.size),
  ];
  return checks.every((c) => c !== false);
}

export interface RouteDecision {
  rule: RoutingRule;
  userId: string;
  usesCursor: boolean;
}

export function routeLead(rules: RoutingRule[], lead: LeadInfo): RouteDecision | null {
  const ordered = [...rules]
    .filter((r) => r.is_active && r.user_ids.length > 0)
    .sort((a, b) => a.position - b.position);
  for (const rule of ordered) {
    if (!ruleMatches(rule, lead)) continue;
    if (rule.mode === "user") return { rule, userId: rule.user_ids[0]!, usesCursor: false };
    const idx =
      ((rule.rr_cursor % rule.user_ids.length) + rule.user_ids.length) % rule.user_ids.length;
    return { rule, userId: rule.user_ids[idx]!, usesCursor: true };
  }
  return null;
}

/** Texto curto que explica a regra para leigo ("SP e RJ · saúde · rodízio entre 3"). */
export function describeRule(rule: {
  match: RoutingMatch;
  mode: string;
  user_ids: string[];
}): string {
  const parts: string[] = [];
  const m = rule.match;
  if (m.states?.length) parts.push(m.states.join(", "));
  if (m.cities?.length) parts.push(m.cities.join(", "));
  if (m.segments?.length) parts.push(`segmento ${m.segments.join(", ")}`);
  if (m.sources?.length) parts.push(`origem ${m.sources.join(", ")}`);
  if (m.sizes?.length) parts.push(`porte ${m.sizes.join(", ")}`);
  if (parts.length === 0) parts.push("qualquer lead");
  parts.push(
    rule.mode === "user" ? "vai para um vendedor" : `rodízio entre ${rule.user_ids.length}`,
  );
  return parts.join(" · ");
}
