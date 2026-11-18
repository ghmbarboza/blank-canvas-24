import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { expectedByToday, pct } from "@/features/reports/lib";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useDeleteGoal, type GoalProgress } from "./api";
import { fmtMetric } from "./goals-format";

// Cartão de uma meta: realizado, alvo, barra com a marca de onde deveria estar hoje.
export function GoalCard({
  g,
  title,
  subtitle,
  isCurrent,
  canDelete,
  accountId,
  featured = false,
}: {
  g: GoalProgress;
  title: string;
  subtitle?: string | undefined;
  isCurrent: boolean;
  canDelete: boolean;
  accountId: string;
  featured?: boolean;
}) {
  const del = useDeleteGoal(accountId);
  const p = pct(g.achieved, g.target);
  const expected = isCurrent ? expectedByToday(g.target) : g.target;
  const ahead = g.achieved >= expected;
  const remaining = Math.max(0, g.target - g.achieved);
  return (
    <article
      className={cn(
        "lift group relative rounded-xl border p-5",
        featured
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-surface",
      )}
    >
      <p className={cn("text-[12px] font-medium", featured ? "text-white/60" : "text-subtle")}>
        {subtitle ?? "Meta do time"}
      </p>
      <h3 className="mt-0.5 truncate text-[15px] font-medium">{title}</h3>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-[28px] leading-none font-semibold tabular-nums">
          {fmtMetric(g.metric, g.achieved)}
        </span>
        <span
          className={cn("text-[13px] tabular-nums", featured ? "text-white/60" : "text-subtle")}
        >
          de {fmtMetric(g.metric, g.target)}
        </span>
      </div>
      <div
        className={cn(
          "relative mt-4 h-2 overflow-hidden rounded-full",
          featured ? "bg-white/15" : "bg-surface-2",
        )}
        role="progressbar"
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            featured ? "bg-white" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, p)}%` }}
        />
        {isCurrent && (
          <span
            className={cn(
              "absolute top-[-3px] h-[14px] w-0.5 rounded",
              featured ? "bg-white/50" : "bg-foreground/40",
            )}
            style={{ left: `${Math.min(100, (expected / g.target) * 100)}%` }}
            title="Onde deveria estar hoje"
          />
        )}
      </div>
      <p className={cn("mt-3 text-[12px]", featured ? "text-white/70" : "text-muted-foreground")}>
        {p >= 100
          ? `Meta batida (${p}%).`
          : isCurrent
            ? `${p}% · ${ahead ? "acima" : "abaixo"} do ritmo · faltam ${fmtMetric(g.metric, remaining)}`
            : `${p}% · faltaram ${fmtMetric(g.metric, remaining)}`}
      </p>
      {canDelete && (
        <button
          type="button"
          aria-label="Excluir meta"
          onClick={() => del.mutate(g.goal_id, { onError: (e) => toast.error(errorMessage(e)) })}
          className={cn(
            "absolute top-3 right-3 rounded-full p-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100",
            featured
              ? "text-white/60 hover:bg-white/10"
              : "text-subtle hover:bg-surface-2 hover:text-danger",
          )}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </article>
  );
}
