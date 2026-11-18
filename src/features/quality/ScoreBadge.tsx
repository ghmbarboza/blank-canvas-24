import { cn } from "@/lib/utils";
import { scoreTone } from "./score-tone";

export function ScoreBadge({
  score,
  eliminated = false,
  className,
}: {
  score: number | null;
  eliminated?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-11 items-center justify-center rounded-full px-2 py-[3px] text-[11px] font-medium tabular-nums",
        scoreTone(score, eliminated),
        className,
      )}
      title={eliminated ? "Eliminada: um item obrigatório foi reprovado" : undefined}
    >
      {eliminated ? "Eliminada" : score === null ? "—" : Math.round(score)}
    </span>
  );
}

export function ScoreBar({ value }: { value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
      <div
        className="h-full origin-left rounded-full bg-primary transition-transform duration-200"
        style={{ transform: `scaleX(${v / 100})` }}
      />
    </div>
  );
}
