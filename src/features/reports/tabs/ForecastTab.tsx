import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarX, Gauge, Target } from "lucide-react";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
import { formatMoney } from "@/lib/format";

import { useForecastReport } from "../api";
import { useReportExport } from "../export-csv";
import { forecastHeadline } from "../headlines";
import { BAR_RADIUS, GRID_PROPS } from "../chart-style";
import { Kpi, Lede, LoadingGrid, Panel } from "../ui";
import { monthLabel } from "../month-label";
import { countLabel } from "@/lib/plural";

const chartConfig = {
  won: { label: "Já ganho", color: "var(--chart-1)" },
  commit: { label: "Compromisso", color: "var(--chart-2)" },
  weighted: { label: "Ponderado", color: "var(--chart-3)" },
  pipeline: { label: "Pipeline total", color: "var(--chart-5)" },
} satisfies ChartConfig;

const FLAG: Record<string, string> = {
  parado: "Parado há 14+ dias",
  data_vencida: "Data de fechamento vencida",
  sem_proximo_passo: "Sem próximo passo",
  cliente_frio: "Cliente frio",
  score_baixo: "Score baixo",
};

// Forecast: ponderado pela probabilidade da etapa + previsão do vendedor + sinais de risco.
export function ForecastTab({ accountId }: { accountId: string }) {
  const [months, setMonths] = useState(3);
  const q = useForecastReport(accountId, months);
  useReportExport(
    q.data
      ? {
          filename: `previsao-${months}-meses`,
          headers: [
            "Mês",
            "Já ganho",
            "Compromisso",
            "Melhor cenário",
            "Ponderado",
            "Pipeline",
            "Negócios",
          ],
          rows: q.data.months.map((m) => [
            m.month,
            m.won,
            m.commit,
            m.best_case,
            m.weighted,
            m.pipeline,
            m.deals,
          ]),
        }
      : null,
  );
  if (q.isPending) return <LoadingGrid />;
  if (q.isError || !q.data)
    return <p className="text-[13px] text-danger">Não deu para carregar o forecast.</p>;
  const r = q.data;
  const cur = r.months[0];

  return (
    <div className="space-y-6">
      <Lede eyebrow="Previsão de fechamento" headline={forecastHeadline(r)} />
      <div className="flex justify-end">
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="h-8 w-44 text-[12px]" aria-label="Horizonte">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 3, 6, 12].map((m) => (
              <SelectItem key={m} value={String(m)}>
                Próximos {m} {m === 1 ? "mês" : "meses"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          dark
          icon={Target}
          label="Este mês: ganho + compromisso"
          value={formatMoney((cur?.won ?? 0) + (cur?.commit ?? 0), true)}
          sub={`Melhor cenário ${formatMoney((cur?.won ?? 0) + (cur?.best_case ?? 0), true)}`}
        />
        <Kpi
          icon={Gauge}
          label="Ponderado do mês"
          value={formatMoney(cur?.weighted ?? 0, true)}
          sub="Valor × probabilidade da etapa"
        />
        <Kpi
          icon={CalendarX}
          label="Com data vencida"
          value={formatMoney(r.overdue.value, true)}
          sub={`${countLabel(r.overdue.deals, "negócio")} para reprogramar`}
        />
        <Kpi
          icon={AlertTriangle}
          label="Sem data prevista"
          value={formatMoney(r.undated.value, true)}
          sub={`${countLabel(r.undated.deals, "negócio")} fora do forecast`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          title="Por mês"
          hint="Compromisso e melhor cenário vêm da previsão marcada pelo vendedor em cada negócio"
        >
          <ChartContainer config={chartConfig} className="h-72 w-full">
            <BarChart data={r.months.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={56}
                tickFormatter={(v: number) => formatMoney(v, true)}
              />
              <ChartTooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={<ChartTooltipContent />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="won" fill="var(--color-won)" radius={BAR_RADIUS} />
              <Bar dataKey="commit" fill="var(--color-commit)" radius={BAR_RADIUS} />
              <Bar dataKey="weighted" fill="var(--color-weighted)" radius={BAR_RADIUS} />
              <Bar dataKey="pipeline" fill="var(--color-pipeline)" radius={BAR_RADIUS} />
            </BarChart>
          </ChartContainer>
        </Panel>
        <Panel title="Por vendedor" hint="No horizonte escolhido">
          {r.by_owner.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              Nenhum negócio aberto com data prevista.
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-subtle">
                  <th className="pb-2 font-medium">Vendedor</th>
                  <th className="pb-2 text-right font-medium">Compromisso</th>
                  <th className="pb-2 text-right font-medium">Ponderado</th>
                  <th className="pb-2 text-right font-medium">Pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {r.by_owner.map((o) => (
                  <tr key={o.user_id ?? "none"}>
                    <td className="py-2 pr-2">{o.name}</td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatMoney(o.commit, true)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(o.weighted, true)}
                    </td>
                    <td className="py-2 text-right text-subtle tabular-nums">
                      {formatMoney(o.pipeline, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Negócios em risco" hint="Sinais que costumam derrubar o forecast">
          {r.risks.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              Nenhum risco à vista. Bom sinal.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {r.risks.map((d) => (
                <li key={d.id}>
                  <Link
                    to="/crm"
                    search={{ negocio: d.id }}
                    className="row-wash flex items-start gap-3 rounded-xl px-2 py-2.5"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{d.title}</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {d.flags.map((f) => (
                          <span
                            key={f}
                            className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {FLAG[f] ?? f}
                          </span>
                        ))}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(d.value, true)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="O forecast do mês está firme?"
          hint="Foto semanal (toda segunda): se o número cai semana a semana, o mês está escapando"
        >
          {r.history.length < 2 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              As fotos semanais começam a aparecer a partir da próxima segunda-feira.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-56 w-full">
              <LineChart
                data={r.history.map((h) => ({
                  ...h,
                  label: new Date(`${h.taken_on}T12:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  }),
                }))}
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={56}
                  tickFormatter={(v: number) => formatMoney(v, true)}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={<ChartTooltipContent />}
                />
                <Line dataKey="commit" stroke="var(--color-commit)" strokeWidth={2} dot={false} />
                <Line
                  dataKey="weighted"
                  stroke="var(--color-weighted)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}
