export type Temperature = "hot" | "warm" | "cold";

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
};

export function isTemperature(v: unknown): v is Temperature {
  return v === "hot" || v === "warm" || v === "cold";
}
