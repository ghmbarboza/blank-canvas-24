import { hasChannel } from "@/lib/edition";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { Kpi, LoadingGrid, Panel } from "@/features/reports/ui";

import { useTrends } from "../api";
import { byGroup, byWeek, delta, formatDuration, totals, type KpiSet } from "../kpis";

// sem telefone na edição, os indicadores de ligação (TMA, TME, abandono) somem
const PHONE = hasChannel("phone");

const PERIODS = [
  { weeks: 8, label: "8 semanas" },
  { weeks: 13, label: "3 meses" },
  { weeks: 26, label: "6 meses" },
];

const TIME_METRICS = {
  tma: { label: "TMA (s)", color: "var(--chart-1)" },
  tme: { label: "TME (s)", color: "var(--chart-3)" },
} satisfies ChartConfig;
const PCT_METRICS = {
  fcr: { label: "Resolvido no 1º contato (%)", color: "var(--chart-1)" },
  abandon: { label: "Abandono (%)", color: "var(--chart-3)" },
} satisfies ChartConfig;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function opt(sub: string | undefined): { sub?: string } {
  return sub ? { sub } : {};
}

function pct(v: number | null) {
  return v === null ? "—" : `${v.toLocaleString("pt-BR")}%`;
}

function trendSub(d: number | null, unit: string, goodWhenDown: boolean): string | undefined {
  if (d === null || d === 0) return d === 0 ? "igual à semana anterior" : undefined;
  const better = goodWhenDown ? d < 0 : d > 0;
  return `${d > 0 ? "+" : ""}${d.toLocaleString("pt-BR")}${unit} na última semana (${better ? "melhorou" : "piorou"})`;
}

// Histórico e tendência dos indicadores clássicos. O ao vivo fica no painel de parede do call center.
export function IndicatorsTab({ accountId }: { accountId: string }) {
  const [weeks, setWeeks] = useState(8);
  const [group, setGroup] = useState<"team" | "agent">("team");
  const to = iso(new Date());
  const from = iso(new Date(Date.now() - weeks * 7 * 86_400_000));
  const q = useTrends(accountId, from, to, group);

  const view = useMemo(() => {
    const rows = q.data ?? [];
    const weekly = byWeek(rows);
    return {
      total: totals(rows),
      weekly,
      groups: byGroup(rows),
      chart: weekly.map((w) => ({
        week: new Date(`${w.week}T12:00:00`).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
        tma: w.kpis.tmaSeconds,
        tme: w.kpis.tmeSeconds,
        fcr: w.kpis.fcrPct,
        abandon: w.kpis.abandonPct,
      })),
    };
  }, [q.data]);

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODS.map((p) => (
        <Chip key={p.weeks} active={weeks === p.weeks} onClick={() => setWeeks(p.weeks)}>
          {p.label}
        </Chip>
      ))}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <Chip active={group === "team"} onClick={() => setGroup("team")}>
        Por equipe
      </Chip>
      <Chip active={group === "agent"} onClick={() => setGroup("agent")}>
        Por atendente
      </Chip>
    </div>
  );

  if (q.isPending)
    return (
      <div className="space-y-4">
        {controls}
        <LoadingGrid />
      </div>
    );
  if (q.isError)
    return (
      <p className="text-[13px] text-danger">Não deu para carregar: {errorMessage(q.error)}</p>
    );
  if ((q.data ?? []).length === 0)
    return (
      <div className="space-y-4">
        {controls}
        <EmptyState
          icon={BarChart3}
          title="Ainda sem atendimento no período"
          description={
            PHONE
              ? "TMA, TME, resolução no primeiro contato, abandono, CSAT e NPS aparecem aqui assim que houver ligações recebidas, chamados ou pesquisas respondidas."
              : "Resolução no primeiro contato, CSAT e NPS aparecem aqui assim que houver chamados ou pesquisas respondidas."
          }
        />
      </div>
    );

  const t = view.total;
  const series = (f: (k: KpiSet) => number | null) => view.weekly.map((w) => f(w.kpis));
  return (
    <div className="space-y-4">
      {controls}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {PHONE && (
          <Kpi
            dark
            label="TMA (ligação)"
            value={formatDuration(t.tmaSeconds)}
            {...opt(trendSub(delta(series((k) => k.tmaSeconds)), " s", true))}
          />
        )}
        {PHONE && (
          <Kpi
            label="TME (espera na fila)"
            value={formatDuration(t.tmeSeconds)}
            {...opt(trendSub(delta(series((k) => k.tmeSeconds)), " s", true))}
          />
        )}
        <Kpi
          label="Resolvido no 1º contato"
          value={pct(t.fcrPct)}
          {...opt(trendSub(delta(series((k) => k.fcrPct)), " p.p.", false))}
        />
        {PHONE && (
          <Kpi
            label="Abandono"
            value={pct(t.abandonPct)}
            sub={`${formatNumber(t.calls)} ligações recebidas`}
          />
        )}
        <Kpi
          label="CSAT"
          value={t.csat === null ? "—" : `${t.csat.toLocaleString("pt-BR")} de 5`}
          sub={`${formatNumber(t.csatN)} respostas`}
        />
        <Kpi
          label="NPS"
          value={t.nps === null ? "—" : String(t.nps)}
          sub={`${formatNumber(t.npsN)} respostas`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Tempo de atendimento e de espera"
          config={TIME_METRICS}
          data={view.chart}
        />
        <TrendChart title="Resolução e abandono" config={PCT_METRICS} data={view.chart} />
      </div>

      <Panel
        title={group === "team" ? "Por equipe ou fila" : "Por atendente"}
        hint={
          PHONE
            ? "Ligações agrupam pela fila; chamados, pela equipe do chamado. NPS não tem equipe e fica só no total."
            : "Chamados agrupam pela equipe do chamado. NPS não tem equipe e fica só no total."
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{group === "team" ? "Equipe" : "Atendente"}</TableHead>
                {PHONE && (
                  <>
                    <TableHead className="text-right">Ligações</TableHead>
                    <TableHead className="text-right">TMA</TableHead>
                    <TableHead className="text-right">TME</TableHead>
                    <TableHead className="text-right">Abandono</TableHead>
                  </>
                )}
                <TableHead className="text-right">Chamados</TableHead>
                <TableHead className="text-right">1º contato</TableHead>
                <TableHead className="text-right">CSAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.groups.map((g) => (
                <TableRow key={g.key} className="row-wash">
                  <TableCell className="font-medium">{g.label}</TableCell>
                  {PHONE && (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(g.kpis.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(g.kpis.tmaSeconds)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(g.kpis.tmeSeconds)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(g.kpis.abandonPct)}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(g.kpis.tickets)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(g.kpis.fcrPct)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {g.kpis.csat === null ? "—" : g.kpis.csat.toLocaleString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-[11px] text-subtle">
          {PHONE
            ? "Resolvido no 1º contato: ligação atendida sem nova ligação do mesmo cliente em 7 dias, e chamado resolvido sem ser reaberto."
            : "Resolvido no 1º contato: chamado resolvido sem ser reaberto."}
        </p>
      </Panel>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
        active
          ? "bg-primary-soft text-foreground ring-1 ring-primary-line"
          : "bg-surface-2 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function TrendChart({
  title,
  config,
  data,
}: {
  title: string;
  config: ChartConfig;
  data: Record<string, string | number | null>[];
}) {
  return (
    <Panel title={title} hint="Por semana, ponderado pelo volume.">
      <ChartContainer config={config} className="h-56 w-full">
        <LineChart data={data}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {Object.keys(config).map((k) => (
            <Line
              key={k}
              dataKey={k}
              stroke={`var(--color-${k})`}
              strokeWidth={2}
              dot={false}
              connectNulls
              type="monotone"
            />
          ))}
        </LineChart>
      </ChartContainer>
    </Panel>
  );
}
