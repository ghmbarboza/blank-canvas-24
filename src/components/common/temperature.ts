export type Temperature = "hot" | "warm" | "cold";

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  hot: "Interesse alto",
  warm: "Interesse médio",
  cold: "Interesse baixo",
};

// Central de pós-venda: o selo de temperatura (conceito de lead) não aparece nas listas e fichas.
// O dado continua no banco; a saúde do cliente (features/gestao/health.ts) ocupa o lugar dele.
export const SHOW_TEMPERATURE = false;

export function isTemperature(v: unknown): v is Temperature {
  return v === "hot" || v === "warm" || v === "cold";
}
