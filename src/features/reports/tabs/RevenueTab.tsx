import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarClock, Repeat, TrendingUp, Users } from "lucide-react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, formatNumber } from "@/lib/format";

import { useMrrReport } from "../api-revenue";
import { useReportExport } from "../export-csv";
import { mrrHeadline } from "../headlines";
import { mrrSummary } from "../revenue";
import { GRID_PROPS } from "../chart-style";
import { Kpi, Lede, LoadingGrid, Panel } from "../ui";
import { monthLabel } from "../month-label";

const chartConfig = {
  mrr: { label: "MRR no fim do mês", color: "var(--chart-1)" },
  new: { label: "Novos", color: "var(--chart-2)" },
  expansion: { label: "Expansão", color: "var(--chart-3)" },
  loss: { label: "Churn e redução", color: "var(--danger)" },
} satisfies ChartConfig;

const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v}%`);

// Receita recorrente: propostas aceitas com cobrança mensal/anual e assinaturas do Asaas.
export function RevenueTab({ accountId }: { accountId: string }) {
  const [months, setMonths] = useState(12);
  const q = useMrrReport(accountId, months);
  useReportExport(
    q.data
      ? {
          filename: `receita-recorrente-${months}-meses`,
          headers: ["Mês", "MRR", "Novos", "Expansão", "Redução", "Churn"],
          rows: q.data.months.map((m) => [
            m.month,
            Number(m.mrr),
            Number(m.new),
            Number(m.expansion),
            Number(m.contraction),
            Number(m.churn),
          ]),
        }
      : null,
  );
  if (q.isPending) return <LoadingGrid />;
  if (q.isError || !q.data)
    return <p className="text-[13px] text-danger">Não deu para carregar a receita recorrente.</p>;
  const r = q.data;
  const s = mrrSummary(Number(r.current_mrr), r.months);
  if (r.months.every((m) => !m.mrr && !m.new && !m.churn) && !r.current_mrr)
    return (
      <EmptyState
        icon={Repeat}
        title="Ainda sem receita recorrente"
        description="Quando uma proposta com valor mensal ou anual for aceita, ou uma assinatura for criada no Asaas, o MRR aparece aqui."
      />
    );
  const data = r.months.map((m) => ({
    label: monthLabel(m.month),
    mrr: Number(m.mrr),
    new: Number(m.new),
    expansion: Number(m.expansion),
    loss: -(Number(m.churn) + Number(m.contraction)),
  }));

  return (
    <div className="space-y-6">
      <Lede eyebrow="Receita recorrente" headline={mrrHeadline(s, r.active_customers)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          dark
          icon={Repeat}
          label="MRR hoje"
          value={formatMoney(s.current, true)}
          sub={`ARR ${formatMoney(s.arr, true)}`}
        />
        <Kpi
          icon={TrendingUp}
          label="Crescimento no mês"
          value={pct(s.growthPct)}
          sub={`${s.netNew >= 0 ? "+" : ""}${formatMoney(s.netNew, true)} líquido`}
        />
        <Kpi icon={Users} label="Clientes recorrentes" value={formatNumber(r.active_customers)} />
        <Kpi
          icon={CalendarClock}
          label="Churn no mês"
          value={s.churnPct === null ? "—" : `${s.churnPct}%`}
          sub="Perdido e redução sobre o mês anterior"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Evolução do MRR"
          hint="Receita recorrente no fim de cada mês"
          aside={
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger className="h-8 w-32 text-[12px]" aria-label="Meses">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
                <SelectItem value="24">24 meses</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <LineChart data={data}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={56}
                tickFormatter={(v: number) => formatMoney(v, true)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="mrr"
                type="monotone"
                stroke="var(--color-mrr)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              />
            </LineChart>
          </ChartContainer>
        </Panel>
        <Panel
          title="O que entrou e o que saiu"
          hint="Acima da linha: clientes novos e expansão. Abaixo: churn e redução."
        >
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart data={data} stackOffset="sign">
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={56}
                tickFormatter={(v: number) => formatMoney(v, true)}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <ChartTooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={
                  <ChartTooltipContent
                    formatter={(v, n) =>
                      `${chartConfig[n as keyof typeof chartConfig]?.label ?? n}: ${formatMoney(Math.abs(Number(v)))}`
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="new" stackId="flow" fill="var(--color-new)" maxBarSize={28} />
              <Bar
                dataKey="expansion"
                stackId="flow"
                fill="var(--color-expansion)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="loss"
                stackId="flow"
                fill="var(--color-loss)"
                radius={[0, 0, 4, 4]}
                maxBarSize={28}
              />
            </BarChart>
          </ChartContainer>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Renovações nos próximos 90 dias"
          hint="Contratos anuais pelo aniversário do aceite"
        >
          {r.renewals.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              Nenhum contrato anual vence nos próximos 90 dias.
            </p>
          ) : (
            <ul className="divide-y divide-border text-[13px]">
              {r.renewals.map((x) => (
                <li key={`${x.deal_id}-${x.renew_on}`} className="flex items-center gap-3 py-2">
                  <span className="w-20 shrink-0 text-[12px] font-medium tabular-nums">
                    {new Date(`${x.renew_on}T12:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                  <DealName dealId={x.deal_id} title={x.title} contact={x.contact} />
                  <span className="shrink-0 tabular-nums">{formatMoney(x.mrr)}/mês</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Maiores clientes recorrentes">
          <ul className="divide-y divide-border text-[13px]">
            {r.top.map((x) => (
              <li key={`${x.deal_id}-${x.since}`} className="flex items-center gap-3 py-2">
                <DealName dealId={x.deal_id} title={x.title} contact={x.contact} />
                <span className="shrink-0 font-medium tabular-nums">{formatMoney(x.mrr)}/mês</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function DealName({
  dealId,
  title,
  contact,
}: {
  dealId: string | null;
  title: string;
  contact: string | null;
}) {
  const body = (
    <>
      <span className="block truncate">{title}</span>
      {contact && <span className="block truncate text-[11px] text-subtle">{contact}</span>}
    </>
  );
  return dealId ? (
    <Link to="/crm" search={{ negocio: dealId }} className="min-w-0 flex-1 hover:underline">
      {body}
    </Link>
  ) : (
    <span className="min-w-0 flex-1">{body}</span>
  );
}
