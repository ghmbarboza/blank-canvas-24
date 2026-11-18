import { Link } from "@tanstack/react-router";

import { METRIC_LABEL, useGoalsProgress, type GoalProgress } from "@/features/commerce/api";
import { formatMoney, formatNumber } from "@/lib/format";

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function monthPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Meta pessoal primeiro (receita na frente); sem ela, a meta de receita da equipe.
function pickGoal(goals: GoalProgress[], userId: string | null): GoalProgress | null {
  const mine = goals.filter((g) => g.user_id === userId);
  const byRevenue = (list: GoalProgress[]) => list.find((g) => g.metric === "revenue") ?? list[0];
  return byRevenue(mine) ?? goals.find((g) => !g.user_id && g.metric === "revenue") ?? null;
}

function amount(metric: string, v: number): string {
  return metric === "revenue" ? formatMoney(v, true) : formatNumber(v);
}

// Anel da meta do mês. Sem meta cadastrada, não aparece.
export function GoalRing({ accountId, userId }: { accountId: string; userId: string | null }) {
  const goals = useGoalsProgress(accountId, monthPeriod(new Date()));
  const goal = goals.data ? pickGoal(goals.data, userId) : null;
  if (!goal) return null;

  const ratio = goal.target > 0 ? goal.achieved / goal.target : 0;
  const pct = Math.round(ratio * 100);
  const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, ratio)));
  const scope = goal.user_id ? "Sua meta do mês" : "Meta da equipe no mês";

  return (
    <Link
      to="/metas"
      className="lift flex shrink-0 items-center gap-4 self-start rounded-2xl border border-border bg-surface p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:self-end"
      aria-label={`${scope}: ${pct}% de ${METRIC_LABEL[goal.metric] ?? goal.metric}`}
    >
      <div className="relative size-14 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--color-surface-3)"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(.2,.7,.2,1)]"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[12px] font-semibold tabular-nums">
          {pct}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="eyebrow">{scope}</p>
        <p className="mt-0.5 text-[14px] font-medium tabular-nums">
          {amount(goal.metric, goal.achieved)} de {amount(goal.metric, goal.target)}
        </p>
        <p className="text-[11px] text-subtle">{METRIC_LABEL[goal.metric] ?? goal.metric}</p>
      </div>
    </Link>
  );
}
