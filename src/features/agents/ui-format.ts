// Peças visuais pequenas da equipe de IA, no padrão do DS (pill 11px, rampa navy, verde só ao vivo).

export const STATUS_LABEL: Record<string, string> = {
  active: "Atendendo",
  draft: "Rascunho",
  paused: "Pausado",
};

export function usd(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v < 0.01 ? "menos de US$ 0,01" : `US$ ${v.toFixed(2).replace(".", ",")}`;
}
