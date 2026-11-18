import { ArrowDown, ArrowUp, Clock } from "lucide-react";

import { TempChip } from "@/components/common/TempChip";

import { DOW_LABEL, type Factor } from "./model";

/** Nota preditiva com a rampa de temperatura do DS (quente ≥ 70, morno ≥ 40, frio abaixo). */
export function PredictiveScore({ score }: { score: number }) {
  const level = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return <TempChip level={level} score={score} />;
}

export function FactorList({ factors }: { factors: Factor[] }) {
  if (factors.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Por que esta nota">
      {factors.map((f) => (
        <li
          key={f.key}
          className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-medium"
        >
          {f.direction === "up" ? (
            <ArrowUp className="size-3 text-foreground" aria-label="aumenta" />
          ) : (
            <ArrowDown className="size-3 text-muted-foreground" aria-label="diminui" />
          )}
          {f.label}
        </li>
      ))}
    </ul>
  );
}

export function BestHour({ hour, dow }: { hour: number | null; dow: number | null }) {
  if (hour === null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
      <Clock className="size-3" aria-hidden />
      Responde melhor às {String(hour).padStart(2, "0")}h{dow !== null ? `, ${DOW_LABEL[dow]}` : ""}
    </span>
  );
}
