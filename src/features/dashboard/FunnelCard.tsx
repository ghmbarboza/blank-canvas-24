import { formatMoney, formatNumber } from "@/lib/format";

import { stageConversions } from "./funnel";

import type { FunnelStage } from "./gerencial";
import { Card, EmptyNote } from "./ui";
import { countLabel } from "@/lib/plural";

const RAMP = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Funil afunilado: largura proporcional à quantidade, conversão acumulada entre etapas vizinhas.
export function FunnelCard({ stages, className }: { stages: FunnelStage[]; className?: string }) {
  const rows = stages.filter((s) => s.kind !== "lost");
  const lost = stages.find((s) => s.kind === "lost");
  const max = Math.max(1, ...rows.map((s) => s.count));
  const won = rows.find((s) => s.kind === "won")?.count ?? 0;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const conversions = stageConversions(rows.map((s) => s.count));

  return (
    <Card
      id="painel-funil"
      eyebrow="Funil de vendas"
      title={
        won > 0
          ? `${Math.round((100 * won) / total)}% dos negócios do período terminaram em ganho`
          : `${countLabel(total, "negócio")} em andamento`
      }
      link={{ to: "/crm", label: "Abrir funil" }}
      className={className}
    >
      {total === 0 ? (
        <EmptyNote>
          Nenhum negócio no funil. Eles nascem da conversa ou pelo botão “Novo negócio”.
        </EmptyNote>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((s, i) => {
            const width = Math.max(24, (s.count / max) * 100);
            const conv = conversions[i] ?? null;
            const dark = i < 2;
            return (
              <li key={s.id}>
                <div className="group flex items-center gap-3">
                  <div className="relative h-10 flex-1">
                    <div
                      className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-[10px] transition-[filter] duration-200 group-hover:brightness-110"
                      style={{ width: `${width}%`, background: RAMP[Math.min(i, RAMP.length - 1)] }}
                    >
                      <span
                        className={`text-[13px] font-semibold tabular-nums ${dark ? "text-white dark:text-[#0A1F3B]" : "text-[#0A1F3B]"}`}
                      >
                        {formatNumber(s.count)}
                      </span>
                    </div>
                  </div>
                  <div className="w-36 shrink-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{s.name}</p>
                    <p className="text-[12px] text-subtle tabular-nums">
                      {formatMoney(s.value, true)}
                    </p>
                  </div>
                </div>
                {conv !== null && (
                  <p className="my-0.5 pr-36 text-center text-[11px] text-subtle tabular-nums">
                    ↓ {conv}% avançam
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {lost && lost.count > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {formatNumber(lost.count)}
          </span>{" "}
          perdidos no período · {formatMoney(lost.value, true)}
        </p>
      )}
    </Card>
  );
}
