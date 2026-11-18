import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useSacMetrics } from "./api";
import { formatResolution } from "./constants";

interface Metric {
  label: string;
  value: string;
  hint: string;
  alert?: boolean;
}

// Faixa de métricas do topo de Chamados: as três que o gestor olha primeiro, mais a fila de agora.
export function TicketsMetricsBar({ accountId, days = 30 }: { accountId: string; days?: number }) {
  const m = useSacMetrics(accountId, days);
  if (m.isPending)
    return (
      <div className="flex gap-6" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-24 rounded-xl" />
        ))}
      </div>
    );
  if (!m.data) return null;
  const d = m.data;
  const items: Metric[] = [
    {
      label: "No prazo",
      value: d.sla_met_pct === null ? "—" : `${Math.round(d.sla_met_pct)}%`,
      hint: `resolvidos dentro do SLA em ${days} dias`,
    },
    {
      label: "Resolução média",
      value: formatResolution(d.resolution_hours_avg),
      hint: `${d.resolved} resolvidos em ${days} dias`,
    },
    {
      label: "CSAT",
      value: d.csat_avg === null ? "—" : d.csat_avg.toFixed(1).replace(".", ","),
      hint:
        d.csat_responses === 0
          ? "ninguém respondeu ainda"
          : `de 5, ${d.csat_responses} ${d.csat_responses === 1 ? "resposta" : "respostas"}`,
    },
    {
      label: "Atrasados",
      value: String(d.breached_open),
      hint: `de ${d.open} na fila agora`,
      alert: d.breached_open > 0,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-end sm:gap-0 sm:divide-x sm:divide-border">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
          <dt className="text-[11px] text-subtle">{it.label}</dt>
          <dd
            className={cn(
              "font-display text-[26px] leading-tight font-semibold tabular-nums",
              it.alert && "text-danger",
            )}
          >
            {it.value}
          </dd>
          <dd className="truncate text-[11px] text-subtle" title={it.hint}>
            {it.hint}
          </dd>
        </div>
      ))}
    </dl>
  );
}
