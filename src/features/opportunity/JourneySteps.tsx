import { Check, CircleDollarSign, Gauge, Headset, Target } from "lucide-react";

import { cn } from "@/lib/utils";

import type { JourneyStep } from "./lib";

const ICON = {
  atender: Headset,
  qualificar: Gauge,
  interesse: Target,
  oportunidade: CircleDollarSign,
} as const;

// Trilha do lead: atender → qualificar → interesse → oportunidade.
export function JourneySteps({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="grid grid-cols-4" aria-label="Etapas do atendimento">
      {steps.map((s, i) => {
        const Icon = s.state === "done" ? Check : ICON[s.key];
        return (
          <li key={s.key} className="relative flex flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 right-1/2 h-0.5 w-full -translate-y-1/2",
                  steps[i - 1]?.state === "done" ? "bg-primary" : "bg-surface-3",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-8 place-items-center rounded-full ring-4 ring-surface transition-colors",
                s.state === "done" && "bg-primary text-primary-foreground",
                s.state === "current" &&
                  "bg-surface text-foreground ring-primary/20 outline-2 outline-primary",
                s.state === "todo" && "bg-surface-2 text-subtle",
              )}
              aria-current={s.state === "current" ? "step" : undefined}
            >
              <Icon className="size-4" strokeWidth={s.state === "done" ? 2.5 : 1.75} aria-hidden />
            </span>
            <span
              className={cn(
                "text-[11px] leading-tight",
                s.state === "todo" ? "text-subtle" : "font-medium text-foreground",
              )}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
