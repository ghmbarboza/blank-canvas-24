import {
  AlarmClock,
  Bot,
  Gauge,
  Inbox,
  Smile,
  ThumbsUp,
  Timer,
  type LucideIcon,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useSacMetrics } from "./api";

function fmtMinutes(m: number | null) {
  if (m === null) return "—";
  if (m >= 60 * 24) return `${(m / 1440).toFixed(1).replace(".", ",")} d`;
  if (m >= 60) return `${(m / 60).toFixed(1).replace(".", ",")} h`;
  return `${Math.round(m)} min`;
}

// Indicadores do SAC (sac_metrics): fila, prazo, tempo de resposta, satisfação e quanto a IA resolveu.
export function SacMetricsStrip({
  accountId,
  days = 30,
  className,
}: {
  accountId: string;
  days?: number;
  className?: string;
}) {
  const m = useSacMetrics(accountId, days);
  if (m.isPending) {
    return (
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7", className)}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!m.data) return null;
  const d = m.data;
  const aiTotal = d.ai_replied + d.ai_handoff;
  const items: { label: string; value: string; hint: string; icon: LucideIcon; alert?: boolean }[] =
    [
      {
        label: "Na fila",
        value: String(d.open),
        hint: `${d.created} abertos em ${days} dias`,
        icon: Inbox,
      },
      {
        label: "Prazo estourado",
        value: String(d.breached_open),
        hint: "abertos fora do SLA",
        icon: AlarmClock,
        alert: d.breached_open > 0,
      },
      {
        label: "1ª resposta",
        value: fmtMinutes(d.first_response_minutes_avg),
        hint: "tempo médio",
        icon: Timer,
      },
      {
        label: "Solução",
        value: d.resolution_hours_avg === null ? "—" : fmtMinutes(d.resolution_hours_avg * 60),
        hint: `${d.sla_met_pct ?? "—"}% dentro do SLA`,
        icon: Gauge,
      },
      {
        label: "CSAT",
        value: d.csat_avg === null ? "—" : `${d.csat_avg.toFixed(1).replace(".", ",")}/5`,
        hint: `${d.csat_responses} de ${d.csat_sent} responderam`,
        icon: Smile,
      },
      {
        label: "NPS",
        value: d.nps === null ? "—" : String(d.nps),
        hint: `${d.nps_responses} respostas`,
        icon: ThumbsUp,
      },
      {
        label: "IA resolveu",
        value: aiTotal ? `${Math.round((100 * d.ai_replied) / aiTotal)}%` : "—",
        hint: `${d.ai_replied} respostas, ${d.ai_handoff} para humano`,
        icon: Bot,
      },
    ];
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7", className)}>
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "rounded-2xl border bg-surface px-4 py-3",
            it.alert ? "border-danger/40" : "border-border",
          )}
        >
          <div className="flex items-center gap-1.5 text-[11px] text-subtle">
            <it.icon className={cn("size-3.5", it.alert && "text-danger")} aria-hidden /> {it.label}
          </div>
          <p
            className={cn(
              "mt-1 font-display text-[22px] leading-none font-semibold tabular-nums",
              it.alert && "text-danger",
            )}
          >
            {it.value}
          </p>
          <p className="mt-1 truncate text-[11px] text-subtle">{it.hint}</p>
        </div>
      ))}
    </div>
  );
}
