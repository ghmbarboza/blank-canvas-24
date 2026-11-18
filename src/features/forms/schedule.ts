// Roteamento para agenda no formulário: quando o envio qualifica, a resposta traz o link de
// agendamento do dono escolhido. Puro: roda igual no construtor (prévia) e no servidor.

export type ScheduleOp = "equals" | "not_equals" | "contains" | "gte" | "lte";

export interface ScheduleCondition {
  field: string;
  op: ScheduleOp;
  value: string;
}

export interface FormScheduleRule {
  enabled: boolean;
  /** "always" = todo envio; "all" = todas as condições precisam bater. */
  match: "always" | "all";
  conditions: ScheduleCondition[];
  /** Página fixa; vazio = a página ativa do dono que o formulário escolheu. */
  booking_slug: string | null;
  label: string;
}

export const DEFAULT_SCHEDULE: FormScheduleRule = {
  enabled: false,
  match: "always",
  conditions: [],
  booking_slug: null,
  label: "Escolha um horário",
};

export const OP_LABEL: Record<ScheduleOp, string> = {
  equals: "é igual a",
  not_equals: "é diferente de",
  contains: "contém",
  gte: "é no mínimo",
  lte: "é no máximo",
};

export function scheduleRule(raw: unknown): FormScheduleRule {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<FormScheduleRule>;
  return {
    enabled: r.enabled === true,
    match: r.match === "all" ? "all" : "always",
    conditions: Array.isArray(r.conditions)
      ? r.conditions
          .filter((c): c is ScheduleCondition =>
            Boolean(c && typeof c.field === "string" && c.field),
          )
          .slice(0, 10)
      : [],
    booking_slug: typeof r.booking_slug === "string" && r.booking_slug ? r.booking_slug : null,
    label:
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim().slice(0, 60)
        : DEFAULT_SCHEDULE.label,
  };
}

const norm = (v: unknown) =>
  String(Array.isArray(v) ? v.join(", ") : (v ?? ""))
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function toNumber(v: unknown): number | null {
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  // "1.500,50" → 1500.5; "1500.5" → 1500.5
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

export function conditionHolds(c: ScheduleCondition, values: Record<string, unknown>): boolean {
  const got = values[c.field];
  switch (c.op) {
    case "equals":
      return norm(got) === norm(c.value);
    case "not_equals":
      return norm(got) !== norm(c.value);
    case "contains":
      return norm(c.value) !== "" && norm(got).includes(norm(c.value));
    case "gte":
    case "lte": {
      const a = toNumber(got);
      const b = toNumber(c.value);
      if (a === null || b === null) return false;
      return c.op === "gte" ? a >= b : a <= b;
    }
    default:
      return false;
  }
}

/** O envio ganha o link de agenda? */
export function qualifiesForSchedule(
  rule: FormScheduleRule,
  values: Record<string, unknown>,
): boolean {
  if (!rule.enabled) return false;
  if (rule.match === "always") return true;
  return rule.conditions.length > 0 && rule.conditions.every((c) => conditionHolds(c, values));
}
