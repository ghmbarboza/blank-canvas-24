// Regras de segmento: um formato só, usado na lista de contatos (navegador), em campanhas e
// automações (servidor). Viram filtros do PostgREST, então o banco faz o trabalho e a RLS vale.
export type SegmentField =
  | "temperature"
  | "lifecycle"
  | "source"
  | "owner"
  | "tag"
  | "score"
  | "company"
  | "email"
  | "phone"
  | "city"
  | "created_days"
  | "inactive_days"
  | `custom.${string}`;

export type SegmentOp = "eq" | "neq" | "is_empty" | "not_empty" | "has" | "not_has" | "gte" | "lte";

export interface SegmentRule {
  field: SegmentField;
  op: SegmentOp;
  value?: string | number | null;
}

export interface SegmentFilter {
  match: "all" | "any";
  rules: SegmentRule[];
}

export const EMPTY_SEGMENT: SegmentFilter = { match: "all", rules: [] };

export const FIELD_LABEL: Record<string, string> = {
  temperature: "Interesse",
  lifecycle: "Fase",
  source: "Origem",
  owner: "Responsável",
  tag: "Etiqueta",
  score: "Nota da IA",
  company: "Empresa",
  email: "E-mail",
  phone: "Telefone",
  city: "Cidade",
  created_days: "Entrou há (dias)",
  inactive_days: "Sem interação há (dias)",
};

export const OP_LABEL: Record<SegmentOp, string> = {
  eq: "é",
  neq: "não é",
  is_empty: "está vazio",
  not_empty: "está preenchido",
  has: "tem",
  not_has: "não tem",
  gte: "é pelo menos",
  lte: "é no máximo",
};

export const FIELD_OPS: Record<string, SegmentOp[]> = {
  temperature: ["eq", "neq", "is_empty"],
  lifecycle: ["eq", "neq"],
  source: ["eq", "neq"],
  owner: ["eq", "is_empty", "not_empty"],
  tag: ["has", "not_has"],
  score: ["gte", "lte"],
  company: ["eq", "is_empty", "not_empty"],
  email: ["not_empty", "is_empty"],
  phone: ["not_empty", "is_empty"],
  city: ["eq", "neq"],
  created_days: ["lte", "gte"],
  inactive_days: ["gte", "lte"],
};

const COLUMN: Record<string, string> = {
  temperature: "temperature",
  lifecycle: "lifecycle",
  source: "source",
  owner: "owner_user_id",
  score: "score",
  company: "company_id",
  email: "email",
  phone: "phone",
  city: "city",
};

function quote(v: unknown): string {
  const s = String(v ?? "");
  return /[,()."]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// Uma regra no formato de filtro textual do PostgREST ("coluna.op.valor"), para usar dentro de or().
export function ruleToFilter(r: SegmentRule): string | null {
  const v = r.value;
  if (r.field === "tag") {
    if (v === undefined || v === null || v === "") return null;
    return r.op === "not_has" ? `tags.not.cs.{${quote(v)}}` : `tags.cs.{${quote(v)}}`;
  }
  if (r.field === "created_days" || r.field === "inactive_days") {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    const col = r.field === "created_days" ? "created_at" : "last_interaction_at";
    // "entrou há no máximo N dias" = created_at >= hoje-N; "sem interação há pelo menos N" = last < hoje-N
    if (r.field === "created_days")
      return r.op === "lte" ? `${col}.gte.${daysAgo(n)}` : `${col}.lte.${daysAgo(n)}`;
    return r.op === "gte"
      ? `or(${col}.lt.${daysAgo(n)},${col}.is.null)`
      : `${col}.gte.${daysAgo(n)}`;
  }
  const col = r.field.startsWith("custom.") ? `custom->>${r.field.slice(7)}` : COLUMN[r.field];
  if (!col) return null;
  switch (r.op) {
    case "eq":
      return v === undefined || v === null || v === "" ? null : `${col}.eq.${quote(v)}`;
    case "neq":
      return v === undefined || v === null || v === "" ? null : `${col}.neq.${quote(v)}`;
    case "is_empty":
      return r.field === "email" || r.field === "phone"
        ? `or(${col}.is.null,${col}.eq."")`
        : `${col}.is.null`;
    case "not_empty":
      return r.field === "email" || r.field === "phone"
        ? `and(${col}.not.is.null,${col}.neq."")`
        : `${col}.not.is.null`;
    case "gte":
      return Number.isFinite(Number(v)) ? `${col}.gte.${Number(v)}` : null;
    case "lte":
      return Number.isFinite(Number(v)) ? `${col}.lte.${Number(v)}` : null;
    default:
      return null;
  }
}

// Combina as regras num único filtro or()/and() aplicável com `query.or(...)`.
export function segmentToOr(filter: SegmentFilter): string | null {
  const parts = filter.rules.map(ruleToFilter).filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;
  return filter.match === "any" ? parts.join(",") : `and(${parts.join(",")})`;
}

interface OrCapable<Q> {
  or(filters: string): Q;
}

export function applySegment<Q extends OrCapable<Q>>(
  query: Q,
  filter: SegmentFilter | null | undefined,
): Q {
  if (!filter) return query;
  const or = segmentToOr(filter);
  return or ? query.or(or) : query;
}

export function isSegmentFilter(v: unknown): v is SegmentFilter {
  return (
    Boolean(v) &&
    typeof v === "object" &&
    ((v as SegmentFilter).match === "all" || (v as SegmentFilter).match === "any") &&
    Array.isArray((v as SegmentFilter).rules)
  );
}
