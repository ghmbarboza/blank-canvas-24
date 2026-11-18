import { isTemperature, TEMPERATURE_LABEL } from "@/components/common/temperature";
import { cn } from "@/lib/utils";

const STROKE: Record<string, string> = {
  hot: "stroke-hot",
  warm: "stroke-warm",
  cold: "stroke-cold",
};

const SIZE = 132;
const STROKE_WIDTH = 10;
const R = (SIZE - STROKE_WIDTH) / 2;
const CIRC = 2 * Math.PI * R;

type Props = { score: number | null; temperature: string | null };

export function ScoreGauge({ score, temperature }: Props) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const label = isTemperature(temperature) ? TEMPERATURE_LABEL[temperature] : "Sem classificação";
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={score === null ? "Ainda sem score" : `Score ${value} de 100, ${label}`}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          className="stroke-surface-3"
        />
        {score !== null && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - value / 100)}
            className={cn(
              "transition-[stroke-dashoffset] duration-500 ease-out",
              (temperature && STROKE[temperature]) ?? "stroke-primary",
            )}
          />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="text-center">
          <span className="block font-display text-5xl leading-none font-semibold tabular-nums">
            {score === null ? "—" : value}
          </span>
          <span className="mt-1 block text-[11px] font-medium text-subtle">{label}</span>
        </span>
      </span>
    </div>
  );
}
