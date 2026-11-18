// Peças visuais pequenas da equipe de IA, no padrão do DS (pill 11px, rampa navy, verde só ao vivo).
import type { ReactNode } from "react";

import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Agent } from "./api";
import { STATUS_LABEL } from "./ui-format";

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "navy" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "navy" && "bg-primary text-primary-foreground",
        tone === "neutral" && "bg-surface-2 text-muted-foreground",
        tone === "danger" && "bg-danger/10 text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  if (status === "active")
    return (
      <Pill tone="neutral" className="text-foreground">
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        {STATUS_LABEL[status]}
      </Pill>
    );
  return <Pill>{STATUS_LABEL[status] ?? status}</Pill>;
}

export function AgentAvatar({
  agent,
  size = 44,
}: {
  agent: Pick<Agent, "name" | "status">;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl font-display font-semibold",
        agent.status === "active"
          ? "bg-primary text-primary-foreground"
          : "bg-surface-3 text-foreground",
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden
    >
      {initials(agent.name)}
    </span>
  );
}

/** Barra da avaliação: o traço vertical marca os 90% exigidos. */
export function PassBar({ rate, danger = false }: { rate: number | null; danger?: boolean }) {
  const pct = rate === null ? 0 : Math.round(rate * 100);
  return (
    <div
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      role="img"
      aria-label={rate === null ? "Sem avaliação" : `${pct}% de acerto`}
    >
      <div
        className={cn(
          "h-full rounded-full transition-transform",
          danger ? "bg-danger" : pct >= 90 ? "bg-primary" : "bg-[color:var(--warm)]",
        )}
        style={{ width: `${pct}%` }}
      />
      <span
        className="absolute inset-y-0 w-px bg-foreground/40"
        style={{ left: "90%" }}
        aria-hidden
      />
    </div>
  );
}
