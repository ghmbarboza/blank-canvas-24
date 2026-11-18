// Cores das etapas (pipeline_stages.color). Classes literais para o Tailwind enxergar.
export const STAGE_COLORS = [
  "slate",
  "sky",
  "violet",
  "amber",
  "orange",
  "emerald",
  "rose",
  "teal",
] as const;
export type StageColor = (typeof STAGE_COLORS)[number];

// As chaves ficam (já estão gravadas no banco); os valores seguem a paleta restrita do DS:
// rampa navy → azul-aço → cinza, verde só para ganho e coral só para perda.
const BAR: Record<StageColor, string> = {
  slate: "bg-[#D0D5DD] dark:bg-[#475467]",
  sky: "bg-[#C4CFDD] dark:bg-[#5E7B9E]",
  violet: "bg-[#93A8C2]",
  amber: "bg-[#5E7B9E] dark:bg-[#8BA3C4]",
  orange: "bg-[#335379] dark:bg-[#A8BAD4]",
  emerald: "bg-success",
  rose: "bg-danger",
  teal: "bg-primary",
};

export const STAGE_COLOR_LABEL: Record<StageColor, string> = {
  slate: "Cinza",
  sky: "Névoa",
  violet: "Aço claro",
  amber: "Aço",
  orange: "Azul escuro",
  emerald: "Verde (fidelizado)",
  rose: "Coral (perdido)",
  teal: "Navy",
};

export function isStageColor(v: unknown): v is StageColor {
  return typeof v === "string" && (STAGE_COLORS as readonly string[]).includes(v);
}

export function stageBarClass(color: string | null | undefined): string {
  return isStageColor(color) ? BAR[color] : BAR.slate;
}
