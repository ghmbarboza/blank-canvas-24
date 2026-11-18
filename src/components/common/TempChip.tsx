import { cn } from "@/lib/utils";
import { isTemperature, SHOW_TEMPERATURE, Temperature, TEMPERATURE_LABEL } from "./temperature";

// Pill canônica do DS (11px, peso 500, sem caixa alta, sem bolinha). A temperatura é lida pela
// intensidade do navy: quente é cheio, morno é azul-aço, frio é contorno cinza.
const STYLE: Record<Temperature, string> = {
  hot: "bg-primary text-primary-foreground border-primary",
  warm: "bg-warm-soft text-warm-fg border-warm-line",
  cold: "bg-cold-soft text-cold-fg border-cold-line",
};

type Props = {
  level: string | null | undefined;
  score?: number | null | undefined;
  className?: string;
};

// A cor nunca vem sozinha: sempre com o rótulo (acessibilidade).
export function TempChip({ level, score, className }: Props) {
  if (!SHOW_TEMPERATURE || !isTemperature(level)) return null;
  const s = STYLE[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] leading-none font-medium tracking-[-0.004em] whitespace-nowrap",
        s,
        className,
      )}
    >
      {typeof score === "number" && <span className="font-semibold tabular-nums">{score}</span>}
      {TEMPERATURE_LABEL[level]}
    </span>
  );
}
