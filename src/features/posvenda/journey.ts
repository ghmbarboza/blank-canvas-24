// A jornada do cliente depois da venda. É o funil padrão de toda conta nova (criado no banco por
// create_account_for, migration 20261118120000_edicao_pos_venda.sql) e o funil que os modelos por
// ramo usam. Mudou aqui? Mude também na migration: o teste journey.test.ts confere os dois.
export const POS_VENDA_PIPELINE = "Pós-venda";

export interface JourneyStage {
  name: string;
  kind: "open" | "won" | "lost";
  /** Chance de o cliente continuar comprando (0 a 100). */
  probability: number;
  color: "slate" | "sky" | "violet" | "amber" | "orange" | "emerald" | "rose" | "teal";
}

// Só "Perdido" fecha o cartão. As outras etapas ficam abertas porque o cliente continua na
// carteira: um cartão fechado como "ganho" sairia das regras (ex.: não daria para marcar Em risco).
export const POS_VENDA_STAGES: readonly JourneyStage[] = [
  { name: "Novo cliente", kind: "open", probability: 60, color: "sky" },
  { name: "Ativando", kind: "open", probability: 70, color: "violet" },
  { name: "Ativo", kind: "open", probability: 90, color: "emerald" },
  { name: "Em risco", kind: "open", probability: 30, color: "amber" },
  { name: "Recuperado", kind: "open", probability: 80, color: "teal" },
  { name: "Perdido", kind: "lost", probability: 0, color: "rose" },
];

export const AT_RISK_STAGE = "Em risco";

/** Recursos que uma conta nova já nasce usando (o resto fica em Ajustes › Recursos extras). */
export const POS_VENDA_DEFAULT_MODULES = ["meu_dia", "automacoes", "gestao"] as const;

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/** Acha a etapa pelo nome, sem ligar para acento ou maiúscula (o dono pode ter reescrito). */
export function findStage<T extends { name: string }>(stages: readonly T[], name: string) {
  const target = norm(name);
  return stages.find((s) => norm(s.name) === target) ?? null;
}
