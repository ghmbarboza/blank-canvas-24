import { startOfMonth } from "date-fns";

import { formatMoney, formatNumber } from "@/lib/format";

import type { BoardDeal, Stage } from "../types";

type Props = { deals: BoardDeal[]; stages: Stage[] };

const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

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

// Faixa de números da carteira, sobre os cartões visíveis (a RLS já limita cada pessoa aos dela).
export function SummaryStrip({ deals, stages }: Props) {
  const atRiskStage = stages.find((s) => normalize(s.name) === "em risco")?.id ?? null;
  const monthStart = startOfMonth(new Date()).toISOString();
  let openValue = 0;
  let openCount = 0;
  let atRisk = 0;
  let lostMonth = 0;
  for (const d of deals) {
    if (d.status === "open") {
      openValue += Number(d.value);
      openCount += 1;
      if (d.stage_id === atRiskStage) atRisk += 1;
    } else if (d.status === "lost" && d.closed_at && d.closed_at >= monthStart) lostMonth += 1;
  }

  return (
    <dl className="flex h-9 shrink-0 items-center gap-6 overflow-x-auto border-b border-border bg-surface-2 px-4 text-[13px] md:px-6">
      <Metric label="Clientes na carteira" value={formatNumber(openCount)} />
      {atRiskStage && <Metric label="Em risco" value={formatNumber(atRisk)} accent={atRisk > 0} />}
      <Metric label="Perdidos no mês" value={formatNumber(lostMonth)} />
      {openValue > 0 && <Metric label="Valor em contratos" value={formatMoney(openValue)} />}
    </dl>
  );
}
