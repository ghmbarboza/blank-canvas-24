import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Headset, PhoneCall, Video } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PRIORITY_LABEL, type TicketPriority } from "@/features/support/constants";
import { formatNumber } from "@/lib/format";

import { useActivityReport, useServiceReport, type ActivityReport, type Range } from "../api";
import { useReportExport } from "../export-csv";
import { activityHeadline, serviceHeadline } from "../headlines";
import { BAR_RADIUS, GRID_PROPS } from "../chart-style";
import { BarList, Kpi, Lede, LoadingGrid, Panel } from "../ui";

const SAC_LABEL: Record<string, { label: string; fmt: (v: number) => string }> = {
  created: { label: "Chamados abertos no período", fmt: formatNumber },
  resolved: { label: "Resolvidos", fmt: formatNumber },
  open: { label: "Em aberto agora", fmt: formatNumber },
  breached_open: { label: "Abertos fora do SLA", fmt: formatNumber },
  first_response_minutes_avg: {
    label: "1ª resposta dos chamados",
    fmt: (v) => `${Math.round(v)} min`,
  },
  resolution_hours_avg: { label: "Tempo de solução (média)", fmt: (v) => `${v.toFixed(1)} h` },
  sla_met_pct: { label: "Dentro do SLA", fmt: (v) => `${Math.round(v)}%` },
  csat_avg: { label: "CSAT médio", fmt: (v) => v.toFixed(1) },
  nps: { label: "NPS", fmt: (v) => String(Math.round(v)) },
  ai_replied: { label: "Respondidos pela IA", fmt: formatNumber },
  ai_handoff: { label: "IA passou para humano", fmt: formatNumber },
};

const DIRECTION: Record<string, string> = {
  inbound: "Recebidas",
  outbound: "Feitas",
  in: "Recebidas",
  out: "Feitas",
};
const STATUS: Record<string, string> = {
  completed: "Atendidas",
  answered: "Atendidas",
  no_answer: "Sem resposta",
  busy: "Ocupado",
  failed: "Falhou",
  missed: "Perdidas",
  voicemail: "Caixa postal",
  ringing: "Tocando",
  in_progress: "Em andamento",
  scheduled: "Agendadas",
  live: "Ao vivo",
  ended: "Encerradas",
  canceled: "Canceladas",
  no_show: "Não compareceu",
};

const dailyConfig = {
  count: { label: "Quantidade", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ServiceTab({ accountId, range }: { accountId: string; range: Range }) {
  const q = useServiceReport(accountId, range);
  useReportExport(
    q.data
      ? {
          filename: `chamados-${range.from}-a-${range.to}`,
          headers: ["Indicador", "Valor"],
          rows: Object.entries(SAC_LABEL)
            .filter(([k]) => typeof q.data?.[k] === "number")
            .map(([k, m]) => [m.label, Number(q.data?.[k])]),
        }
      : null,
  );
  if (q.isPending) return <LoadingGrid />;
  const data = q.data;
  if (!data)
    return (
      <EmptyState
        icon={Headset}
        title="Atendimento ainda não ligado"
        description="Quando o módulo de chamados (SAC) estiver ativo, SLA, tempo de resposta, CSAT e NPS aparecem aqui."
      />
    );
  const tiles = Object.entries(SAC_LABEL).filter(([k]) => typeof data[k] === "number");
  const byStatus = (data["by_status"] ?? {}) as Record<string, number>;
  const byPriority = (data["by_priority"] ?? {}) as Record<string, number>;
  return (
    <div className="space-y-6">
      <Lede eyebrow="Chamados no período" headline={serviceHeadline(data)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([k, m], i) => (
          <Kpi key={k} dark={i === 0} label={m.label} value={m.fmt(Number(data[k]))} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Por situação">
          <BarList
            rows={Object.entries(byStatus).map(([k, v]) => ({
              label: STATUS[k] ?? k,
              value: Number(v),
            }))}
            format={formatNumber}
          />
        </Panel>
        <Panel title="Por prioridade">
          <BarList
            rows={Object.entries(byPriority).map(([k, v]) => ({
              label: PRIORITY_LABEL[k as TicketPriority] ?? "Sem prioridade",
              value: Number(v),
            }))}
            format={formatNumber}
          />
        </Panel>
      </div>
    </div>
  );
}

function ActivityBlock({ data, kind }: { data: ActivityReport; kind: "calls" | "meetings" }) {
  const noun = kind === "calls" ? "ligações" : "reuniões";
  useReportExport({
    filename: `${noun}-por-dia`,
    headers: ["Dia", "Quantidade"],
    rows: data.daily.map((d) => [d.day, d.count]),
  });
  return (
    <div className="space-y-6">
      <Lede
        eyebrow={`${noun[0]!.toUpperCase()}${noun.slice(1)} no período`}
        headline={activityHeadline(data, kind)}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi dark label={`Total de ${noun}`} value={formatNumber(data.total)} />
        <Kpi
          label="Duração média"
          value={data.avg_minutes === null ? "—" : `${data.avg_minutes} min`}
        />
        <Kpi label="Minutos no total" value={formatNumber(data.total_minutes)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Por dia">
          {data.daily.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">Nada no período.</p>
          ) : (
            <ChartContainer config={dailyConfig} className="h-56 w-full">
              <BarChart
                data={data.daily.map((d) => ({
                  ...d,
                  label: new Date(`${d.day}T12:00:00`).toLocaleDateString("pt-BR", {
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
                  width={28}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={BAR_RADIUS}
                  maxBarSize={28}
                />
              </BarChart>
            </ChartContainer>
          )}
        </Panel>
        <Panel title="Como terminaram">
          <BarList
            rows={Object.entries(data.by_status)
              .filter(([k]) => k !== "-")
              .map(([k, v]) => ({ label: STATUS[k] ?? k, value: Number(v) }))}
            format={formatNumber}
          />
          {kind === "calls" &&
            Object.keys(data.by_direction).filter((k) => k !== "-").length > 0 && (
              <div className="mt-5">
                <BarList
                  rows={Object.entries(data.by_direction).map(([k, v]) => ({
                    label: DIRECTION[k] ?? k,
                    value: Number(v),
                  }))}
                  format={formatNumber}
                />
              </div>
            )}
        </Panel>
      </div>
    </div>
  );
}

export function CallsTab({ accountId, range }: { accountId: string; range: Range }) {
  const q = useActivityReport(accountId, "calls", range);
  if (q.isPending) return <LoadingGrid />;
  if (!q.data)
    return (
      <EmptyState
        icon={PhoneCall}
        title="Telefonia ainda não ligada"
        description="Com a Zadarma conectada, ligações feitas, recebidas e da IA de voz aparecem aqui."
      />
    );
  return <ActivityBlock data={q.data} kind="calls" />;
}

export function MeetingsTab({ accountId, range }: { accountId: string; range: Range }) {
  const q = useActivityReport(accountId, "meetings", range);
  if (q.isPending) return <LoadingGrid />;
  if (!q.data)
    return (
      <EmptyState
        icon={Video}
        title="Reuniões ainda não ligadas"
        description="As reuniões na sala própria da Central de CS aparecem aqui com duração e comparecimento."
      />
    );
  return <ActivityBlock data={q.data} kind="meetings" />;
}
