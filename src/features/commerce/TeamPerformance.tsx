import { Users } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { OwnerAvatar } from "@/features/contacts/components/OwnerAvatar";
import type { TeamMember } from "@/features/contacts/types";
import { pct } from "@/features/reports/lib";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PerformanceRow {
  userId: string;
  name: string;
  wonValue: number;
  won: number;
  goal: number | undefined;
  commission: number;
  pending: number;
}

type Props = {
  rows: PerformanceRow[];
  members: Map<string, TeamMember>;
  currentUserId: string | undefined;
  isCurrentMonth: boolean;
};

const RING = 2 * Math.PI * 20;

function ProgressRing({ value, hasGoal }: { value: number; hasGoal: boolean }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <span className="relative grid size-12 shrink-0 place-items-center" aria-hidden>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3.5" className="stroke-surface-3" />
        {hasGoal && (
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-700"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - clamped / 100)}
          />
        )}
      </svg>
      <span className="text-[11px] font-semibold tabular-nums">
        {hasGoal ? `${Math.round(value)}%` : "—"}
      </span>
    </span>
  );
}

function statusOf(row: PerformanceRow, isCurrentMonth: boolean) {
  if (row.goal === undefined)
    return { label: "Sem meta", className: "bg-surface-3 text-muted-foreground" };
  if (row.wonValue >= row.goal)
    return { label: "Meta batida", className: "bg-primary text-primary-foreground" };
  return isCurrentMonth
    ? { label: "Em andamento", className: "border border-border text-muted-foreground" }
    : { label: "Não bateu", className: "border border-border text-muted-foreground" };
}

// Desempenho por pessoa: anel da meta de receita, vendas fechadas e quanto tem a receber.
export function TeamPerformance({ rows, members, currentUserId, isCurrentMonth }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Ninguém fechou negócio neste mês ainda"
        description="Quando um negócio vira ganho, a venda e a comissão de quem vendeu aparecem aqui."
        className="py-10"
      />
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const p = r.goal ? pct(r.wonValue, r.goal) : 0;
        const status = statusOf(r, isCurrentMonth);
        return (
          <li
            key={r.userId}
            className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <ProgressRing value={p} hasGoal={r.goal !== undefined} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <OwnerAvatar member={members.get(r.userId)} size={20} className="sm:hidden" />
                  <p className="truncate text-[15px] font-semibold">
                    {r.name}
                    {r.userId === currentUserId && (
                      <span className="font-normal text-subtle"> (você)</span>
                    )}
                  </p>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
                      status.className,
                    )}
                  >
                    {status.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
                  {formatMoney(r.wonValue)} em vendas
                  {r.goal !== undefined && (
                    <span className="text-subtle"> de {formatMoney(r.goal, true)}</span>
                  )}
                  {r.won > 0 && (
                    <span className="text-subtle">
                      {" "}
                      · {r.won} negócio{r.won === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <dl className="flex items-end justify-between gap-6 border-t border-border pt-3 sm:border-t-0 sm:pt-0">
              <div className="text-right">
                <dt className="text-[11px] text-subtle">Comissão no mês</dt>
                <dd className="text-[13px] font-medium tabular-nums">
                  {formatMoney(r.commission)}
                </dd>
              </div>
              <div className="text-right sm:min-w-32 sm:border-l sm:border-border sm:pl-6">
                <dt className="eyebrow">A receber</dt>
                <dd className="font-display text-[18px] font-semibold tabular-nums">
                  {formatMoney(r.pending)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
