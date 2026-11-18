// SLA por plano do cliente: regra "etiqueta/campo do contato ou empresa → prazos".
// O banco aplica na criação do chamado (public.sla_for_ticket); aqui ficam a validação do
// formulário e o espelho da regra de casamento, para a tela explicar qual regra vale.
import { PRIORITY_ORDER, type TicketPriority } from "./constants";

export type SlaTargets = Partial<Record<TicketPriority, { first?: number; resolution?: number }>>;

export interface SlaPlanRuleLike {
  id: string;
  name: string;
  match_kind: "tag" | "field" | string;
  match_field: string | null;
  match_value: string;
  applies_to: "any" | "contact" | "company" | string;
  position: number;
  is_active: boolean;
  created_at?: string;
}

export interface CustomerLike {
  tags?: string[] | null;
  custom?: Record<string, unknown> | null;
}

const MAX_MINUTES = 129_600;
const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** Converte "1,5" (horas) em minutos inteiros. Vazio vira null (usa o prazo da prioridade). */
export function hoursToMinutes(v: string): number | null | "invalid" {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "invalid";
  const m = Math.round(n * 60);
  return m >= 1 && m <= MAX_MINUTES ? m : "invalid";
}

export function minutesToHours(m: number | undefined | null): string {
  if (!m) return "";
  return m % 60 === 0 ? String(m / 60) : (m / 60).toFixed(1).replace(".", ",");
}

/** Monta o jsonb targets a partir do formulário (horas por prioridade). */
export function buildTargets(
  rows: Partial<Record<TicketPriority, { first: string; resolution: string }>>,
): { ok: true; targets: SlaTargets } | { ok: false; error: string } {
  const targets: SlaTargets = {};
  for (const p of PRIORITY_ORDER) {
    const r = rows[p];
    if (!r) continue;
    const first = hoursToMinutes(r.first);
    const resolution = hoursToMinutes(r.resolution);
    if (first === "invalid" || resolution === "invalid")
      return { ok: false, error: "Use horas maiores que zero (até 90 dias)" };
    if (first !== null || resolution !== null)
      targets[p] = {
        ...(first !== null ? { first } : {}),
        ...(resolution !== null ? { resolution } : {}),
      };
  }
  if (Object.keys(targets).length === 0)
    return { ok: false, error: "Preencha o prazo de pelo menos uma prioridade" };
  return { ok: true, targets };
}

function matches(rule: SlaPlanRuleLike, c: CustomerLike | null | undefined): boolean {
  if (!c) return false;
  const want = norm(rule.match_value);
  if (!want) return false;
  if (rule.match_kind === "tag") return (c.tags ?? []).some((t) => norm(t) === want);
  if (rule.match_kind === "field" && rule.match_field)
    return norm(c.custom?.[rule.match_field]) === want;
  return false;
}

/** Mesma regra do banco: a primeira regra ativa (menor posição) que casa com contato ou empresa. */
export function matchSlaRule<R extends SlaPlanRuleLike>(
  rules: R[],
  contact: CustomerLike | null | undefined,
  company: CustomerLike | null | undefined,
): R | null {
  const sorted = [...rules]
    .filter((r) => r.is_active)
    .sort(
      (a, b) => a.position - b.position || (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    );
  return (
    sorted.find(
      (r) =>
        ((r.applies_to === "any" || r.applies_to === "contact") && matches(r, contact)) ||
        ((r.applies_to === "any" || r.applies_to === "company") && matches(r, company)),
    ) ?? null
  );
}

/** Texto curto da condição, para a lista de regras. */
export function describeRule(r: SlaPlanRuleLike): string {
  const where =
    r.applies_to === "contact" ? "no contato" : r.applies_to === "company" ? "na empresa" : "";
  const cond =
    r.match_kind === "tag"
      ? `etiqueta "${r.match_value}"`
      : `campo "${r.match_field ?? ""}" igual a "${r.match_value}"`;
  return where ? `${cond} ${where}` : cond;
}
