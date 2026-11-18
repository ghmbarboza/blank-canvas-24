import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Clock, Percent, Receipt, Trophy } from "lucide-react";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePipelines } from "@/features/crm/api";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useSalesReport, type Range, type SalesReport } from "../api";
import { useReportExport } from "../export-csv";
import { salesHeadline } from "../headlines";
import { BAR_RADIUS, GRID_PROPS } from "../chart-style";
import { BarList, Kpi, Lede, LoadingGrid, Panel, PerfTable } from "../ui";
import { monthLabel } from "../month-label";
import { countLabel } from "@/lib/plural";

// Uma medida por gráfico (sem eixo duplo): a pessoa escolhe qual série ver.
const SERIES = {
  won_value: { label: "Receita ganha", color: "var(--chart-1)" },
  created: { label: "Negócios criados", color: "var(--chart-1)" },
} as const;
type SeriesKey = keyof typeof SERIES;
type Owner = SalesReport["by_owner"][number];

const winRate = (o: Owner) =>
  o.won + o.lost > 0 ? `${Math.round((100 * o.won) / (o.won + o.lost))}%` : "—";

export function SalesTab({ accountId, range }: { accountId: string; range: Range }) {
  const pipelines = usePipelines(accountId);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesKey>("won_value");
  const q = useSalesReport(accountId, range, pipelineId);
  useReportExport(
    q.data
      ? {
          filename: `vendas-por-vendedor-${range.from}-a-${range.to}`,
          headers: [
            "Vendedor",
            "Ganhos",
            "Receita ganha",
            "Perdidos",
            "Taxa de ganho",
            "Em aberto",
          ],
          rows: q.data.by_owner.map((o) => [
            o.name,
            o.won,
            o.won_value,
            o.lost,
            winRate(o),
            o.open_value,
          ]),
        }
      : null,
  );
  if (q.isPending) return <LoadingGrid />;
  if (q.isError || !q.data)
    return <p className="text-[13px] text-danger">Não deu para carregar o relatório de vendas.</p>;
  const r = q.data;
  const t = r.totals;
  const openStages = r.funnel.filter((s) => s.kind === "open" || s.kind === "won");
  const top = Math.max(1, ...openStages.map((s) => s.reached));

  const chartConfig = { [series]: SERIES[series] } satisfies ChartConfig;

  return (
    <div className="space-y-6">
      <Lede eyebrow="Vendas no período" headline={salesHeadline(r)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          dark
          icon={Trophy}
          label="Receita ganha no período"
          value={formatMoney(t.won_value, true)}
          sub={`${formatNumber(t.won)} negócio${t.won === 1 ? "" : "s"} ganho${t.won === 1 ? "" : "s"}`}
        />
        <Kpi
          icon={Percent}
          label="Taxa de ganho"
          value={t.win_rate === null ? "—" : `${t.win_rate}%`}
          sub={`${t.won} ganhos · ${t.lost} perdidos`}
        />
        <Kpi icon={Receipt} label="Ticket médio" value={formatMoney(t.avg_ticket, true)} />
        <Kpi
          icon={Clock}
          label="Ciclo médio de venda"
          value={t.avg_cycle_days === null ? "—" : `${t.avg_cycle_days} dias`}
          sub="Da criação ao ganho"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel
          title="Funil do período"
          hint={`${countLabel(t.created, "negócio criado", "negócios criados")} no período e até onde chegaram`}
          aside={
            (pipelines.data ?? []).length > 1 && (
              <Select value={pipelineId ?? r.pipeline_id ?? ""} onValueChange={setPipelineId}>
                <SelectTrigger className="h-8 w-44 text-[12px]" aria-label="Funil">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(pipelines.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
        >
          {openStages.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">Funil sem etapas.</p>
          ) : (
            <ol className="space-y-2">
              {openStages.map((s, i) => {
                const prev = i > 0 ? openStages[i - 1]!.reached : null;
                const conv = prev ? Math.round((100 * s.reached) / Math.max(1, prev)) : null;
                return (
                  <li key={s.stage_id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                      <span className={cn("truncate", s.kind === "won" && "font-semibold")}>
                        {s.name}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatNumber(s.reached)}
                        {conv !== null && (
                          <span className="ml-2 text-[11px] text-subtle">
                            {conv}% da etapa anterior
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-7 overflow-hidden rounded-xl bg-surface-2">
                      <div
                        className={cn(
                          "flex h-full items-center rounded-xl px-2 text-[11px] font-medium text-primary-foreground transition-[width] duration-700",
                          s.kind === "won" ? "bg-success" : "bg-primary",
                        )}
                        style={{
                          width: s.reached > 0 ? `${Math.max(6, (s.reached / top) * 100)}%` : "0%",
                          opacity: s.kind === "won" ? 1 : 1 - i * 0.08,
                        }}
                      >
                        {s.current_count > 0 && s.kind === "open" && `${s.current_count} hoje`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        <Panel
          title="Últimos 12 meses"
          hint={series === "won_value" ? "Receita ganha por mês" : "Negócios criados por mês"}
          aside={
            <div
              role="group"
              aria-label="Série do gráfico"
              className="flex rounded-full border border-border p-0.5"
            >
              {(Object.keys(SERIES) as SeriesKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={series === k}
                  onClick={() => setSeries(k)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    series === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "won_value" ? "Receita" : "Criados"}
                </button>
              ))}
            </div>
          }
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart data={r.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={series === "won_value" ? 56 : 32}
                allowDecimals={false}
                tickFormatter={(v: number) =>
                  series === "won_value" ? formatMoney(v, true) : formatNumber(v)
                }
              />
              <ChartTooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={<ChartTooltipContent />}
              />
              <Bar
                dataKey={series}
                fill={`var(--color-${series})`}
                radius={BAR_RADIUS}
                maxBarSize={32}
              />
            </BarChart>
          </ChartContainer>
        </Panel>
      </div>

      <Panel
        title="Desempenho por vendedor"
        hint="Negócios decididos no período e o que cada um ainda tem em aberto"
      >
        <PerfTable
          rows={r.by_owner}
          rowKey={(o) => o.user_id ?? o.name}
          caption="Desempenho por vendedor"
          empty="Nenhum negócio com vendedor no período."
          columns={[
            { label: "Vendedor", render: (o) => <span className="font-medium">{o.name}</span> },
            { label: "Ganhos", numeric: true, render: (o) => formatNumber(o.won) },
            {
              label: "Receita ganha",
              numeric: true,
              render: (o) => <span className="font-medium">{formatMoney(o.won_value, true)}</span>,
            },
            { label: "Perdidos", numeric: true, render: (o) => formatNumber(o.lost) },
            { label: "Taxa de ganho", numeric: true, render: winRate },
            {
              label: "Em aberto",
              numeric: true,
              render: (o) => (
                <span className="text-muted-foreground">{formatMoney(o.open_value, true)}</span>
              ),
            },
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Receita por produto">
          <BarList
            rows={r.by_product.map((p) => ({
              label: p.name,
              value: Number(p.revenue),
              sub: `${formatNumber(Number(p.quantity))} un.`,
            }))}
            format={(v) => formatMoney(v, true)}
            empty="Nenhum item vendido no período."
          />
        </Panel>
        <Panel title="Por que perdemos">
          <BarList
            rows={r.lost_reasons.map((l) => ({
              label: l.reason,
              value: l.count,
              sub: formatMoney(l.value, true),
            }))}
            format={formatNumber}
            empty="Nenhum negócio perdido no período."
          />
        </Panel>
      </div>
    </div>
  );
}
