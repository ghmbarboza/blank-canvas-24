import { formatNumber } from "@/lib/format";
import { countLabel } from "@/lib/plural";

import type { FunnelStage } from "./gerencial";
import { Card, EmptyNote } from "./ui";

// Jornada do cliente: quantos clientes estão em cada etapa da carteira (Novo cliente, Ativando,
// Ativo, Em risco, Recuperado). Não é funil de conversão: as etapas não são uma fila única.
export function JourneyCard({ stages, className }: { stages: FunnelStage[]; className?: string }) {
  const rows = stages.filter((s) => s.kind !== "lost");
  const lost = stages.find((s) => s.kind === "lost");
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((s) => s.count));
  const busiest = rows.reduce<FunnelStage | null>(
    (best, s) => (s.count > (best?.count ?? 0) ? s : best),
    null,
  );

  return (
    <Card
      id="painel-jornada"
      eyebrow="Jornada do cliente"
      title={
        busiest && total > 0
          ? `${countLabel(total, "cliente")} na carteira, a maioria em ${busiest.name}`
          : "Em que etapa cada cliente está"
      }
      link={{ to: "/crm", label: "Abrir carteira" }}
      className={className}
    >
      {rows.length === 0 ? (
        <EmptyNote>
          A jornada do cliente ainda não foi criada. Abra a Carteira para criar.
        </EmptyNote>
      ) : total === 0 ? (
        <EmptyNote>
          Ninguém na carteira ainda. Coloque um cliente pela Carteira ou pela conversa dele, no
          botão “Colocar na carteira”.
        </EmptyNote>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((s) => (
            <li key={s.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
              <span className="truncate text-[13px] font-medium text-foreground">{s.name}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-chart-2 transition-[width] duration-500"
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right text-[13px] font-semibold tabular-nums">
                {formatNumber(s.count)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {lost && lost.count > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {formatNumber(lost.count)}
          </span>{" "}
          {lost.count === 1 ? "saiu" : "saíram"} da carteira no período ({lost.name}).
        </p>
      )}
    </Card>
  );
}
