// Formato do playbook cadastrável (colunas jsonb de public.playbooks). Usado pela tela de
// edição, pelo motor do coach (src/features/coach/engine.ts) e pelo worker do livecoach.

export interface PlaybookItem {
  id: string;
  label: string;
  required: boolean;
  /** Palavras ou frases que, ditas pelo vendedor, contam o item como feito. */
  keywords: string[];
}

export interface PlaybookPhase {
  id: string;
  name: string;
  items: PlaybookItem[];
}

export interface QualificationQuestion {
  id: string;
  label: string;
  /** Campo BANT/MEDDIC que a resposta preenche no negócio (ex.: budget, authority). */
  field?: string;
}

export interface Objection {
  id: string;
  label: string;
  triggers: string[];
  answer: string;
  proof?: string;
}

export interface Competitor {
  id: string;
  name: string;
  triggers: string[];
  arguments: string[];
}

export interface ClosingSignal {
  id: string;
  label: string;
  triggers: string[];
  proposal: string;
}

export type Framework = "BANT" | "MEDDIC" | "SPIN" | "GPCT" | "custom";

export interface PlaybookContent {
  name: string;
  description?: string | null;
  framework: Framework;
  phases: PlaybookPhase[];
  questions: QualificationQuestion[];
  objections: Objection[];
  competitors: Competitor[];
  closing_signals: ClosingSignal[];
  forbidden_phrases: string[];
}

export interface ScorecardCriterion {
  id: string;
  label: string;
  description?: string;
  weight: number;
}

export const FRAMEWORK_FIELDS: Record<Framework, { id: string; label: string }[]> = {
  BANT: [
    { id: "budget", label: "Orçamento" },
    { id: "authority", label: "Quem decide" },
    { id: "need", label: "Necessidade" },
    { id: "timeline", label: "Prazo" },
  ],
  MEDDIC: [
    { id: "metrics", label: "Métricas" },
    { id: "economic_buyer", label: "Comprador econômico" },
    { id: "decision_criteria", label: "Critérios de decisão" },
    { id: "decision_process", label: "Processo de decisão" },
    { id: "identify_pain", label: "Dor" },
    { id: "champion", label: "Campeão interno" },
  ],
  SPIN: [
    { id: "situation", label: "Situação" },
    { id: "problem", label: "Problema" },
    { id: "implication", label: "Implicação" },
    { id: "need_payoff", label: "Necessidade de solução" },
  ],
  GPCT: [
    { id: "goals", label: "Metas" },
    { id: "plans", label: "Planos" },
    { id: "challenges", label: "Desafios" },
    { id: "timeline", label: "Prazo" },
  ],
  custom: [],
};

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function strs(v: unknown): string[] {
  return arr<unknown>(v).filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

/** Lê uma linha do banco (jsonb solto) e devolve o playbook tipado, tolerante a lixo. */
export function parsePlaybook(row: Record<string, unknown>): PlaybookContent {
  const fw = row["framework"];
  return {
    name: typeof row["name"] === "string" ? row["name"] : "Playbook",
    description: typeof row["description"] === "string" ? row["description"] : null,
    framework: (["BANT", "MEDDIC", "SPIN", "GPCT", "custom"] as const).includes(fw as Framework)
      ? (fw as Framework)
      : "BANT",
    phases: arr<PlaybookPhase>(row["phases"]).map((p, i) => ({
      id: String(p?.id ?? `fase-${i}`),
      name: String(p?.name ?? `Fase ${i + 1}`),
      items: arr<PlaybookItem>(p?.items).map((it, j) => ({
        id: String(it?.id ?? `item-${i}-${j}`),
        label: String(it?.label ?? ""),
        required: Boolean(it?.required),
        keywords: strs(it?.keywords),
      })),
    })),
    questions: arr<QualificationQuestion>(row["questions"]).map((q, i) => ({
      id: String(q?.id ?? `q-${i}`),
      label: String(q?.label ?? ""),
      ...(q?.field ? { field: String(q.field) } : {}),
    })),
    objections: arr<Objection>(row["objections"]).map((o, i) => ({
      id: String(o?.id ?? `obj-${i}`),
      label: String(o?.label ?? ""),
      triggers: strs(o?.triggers),
      answer: String(o?.answer ?? ""),
      ...(o?.proof ? { proof: String(o.proof) } : {}),
    })),
    competitors: arr<Competitor>(row["competitors"]).map((c, i) => ({
      id: String(c?.id ?? `conc-${i}`),
      name: String(c?.name ?? ""),
      triggers: strs(c?.triggers),
      arguments: strs(c?.arguments),
    })),
    closing_signals: arr<ClosingSignal>(row["closing_signals"]).map((c, i) => ({
      id: String(c?.id ?? `fech-${i}`),
      label: String(c?.label ?? ""),
      triggers: strs(c?.triggers),
      proposal: String(c?.proposal ?? ""),
    })),
    forbidden_phrases: strs(row["forbidden_phrases"]),
  };
}
