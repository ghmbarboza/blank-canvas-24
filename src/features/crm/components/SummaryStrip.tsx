import { startOfMonth } from "date-fns";

import { formatMoney, formatNumber } from "@/lib/format";

import type { BoardDeal, Stage } from "../types";

type Props = { deals: BoardDeal[]; stages: Stage[] };

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          accent
            ? "font-semibold text-primary tabular-nums"
            : "font-semibold text-foreground tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

// Faixa de números do funil. Calculada sobre os negócios visíveis (a RLS já limita o vendedor aos dele).
export function SummaryStrip({ deals, stages }: Props) {
  const prob = new Map(stages.map((s) => [s.id, s.probability]));
  const monthStart = startOfMonth(new Date()).toISOString();
  let openValue = 0;
  let weighted = 0;
  let openCount = 0;
  let wonMonth = 0;
  let won = 0;
  let lost = 0;
  for (const d of deals) {
    const v = Number(d.value);
    if (d.status === "open") {
      openValue += v;
      openCount += 1;
      weighted += (v * (prob.get(d.stage_id) ?? 0)) / 100;
    } else if (d.status === "won") {
      won += 1;
      if (d.closed_at && d.closed_at >= monthStart) wonMonth += v;
    } else if (d.status === "lost") lost += 1;
  }
  const conversion =
    won + lost > 0 ? `${((won / (won + lost)) * 100).toFixed(1).replace(".", ",")}%` : "—";

  return (
    <dl className="flex h-9 shrink-0 items-center gap-6 overflow-x-auto border-b border-border bg-surface-2 px-4 text-[13px] md:px-6">
      <Metric label="Em aberto" value={formatMoney(openValue)} />
      <Metric label="Negócios" value={formatNumber(openCount)} />
      <Metric label="Previsão ponderada" value={formatMoney(weighted)} />
      <Metric label="Ganho no mês" value={formatMoney(wonMonth)} />
      <Metric label="Conversão" value={conversion} accent />
    </dl>
  );
}
