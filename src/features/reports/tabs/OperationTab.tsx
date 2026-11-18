import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Clock, Gauge, Loader2, PhoneMissed, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/lib/account";
import { formatMoney, formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import type { Range } from "../api";
import {
  useAdSpend,
  useDeleteAdSpend,
  useOpsReport,
  useSaveAdSpend,
  type OpsReport,
} from "../api-revenue";
import { costPerLead, monthStart, npsScore, parseAmount, perUnit } from "../revenue";
import { useReportExport } from "../export-csv";
import { opsHeadline } from "../headlines";
import { BAR_RADIUS, GRID_PROPS } from "../chart-style";
import { BarList, Kpi, Lede, LoadingGrid, Panel, PerfTable } from "../ui";
import { monthLabel } from "../month-label";

const USD = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 3,
});
const usd = (v: number | null) => (v === null ? "—" : USD.format(v));
const secs = (v: number | null) =>
  v === null ? "—" : v >= 60 ? `${Math.round(v / 60)} min` : `${v} s`;

const COST_KIND: Record<string, string> = {
  llm: "IA (texto)",
  voice_ai_min: "IA de voz",
  phone_min: "Telefonia",
  transcription_min: "Transcrição",
  whatsapp_template: "Modelos de WhatsApp",
  email: "E-mail",
  sms: "SMS",
  meeting_min: "Reuniões",
  other: "Outros",
};

const levelConfig = {
  level: { label: "Nível de serviço", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Operação: nível de serviço e ocupação da central, satisfação do período e quanto custa cada conversa,
// cada ligação e cada lead.
export function OperationTab({ accountId, range }: { accountId: string; range: Range }) {
  const q = useOpsReport(accountId, range);
  useReportExport(
    q.data
      ? {
          filename: `equipe-da-central-${range.from}-a-${range.to}`,
          headers: ["Atendente", "Ligações", "Minutos falando", "Ocupação (%)"],
          rows: q.data.service.agents.map((a) => [
            a.name,
            a.calls,
            a.talk_minutes,
            a.occupancy ?? "",
          ]),
        }
      : null,
  );
  if (q.isPending) return <LoadingGrid />;
  if (q.isError || !q.data)
    return <p className="text-[13px] text-danger">Não deu para carregar o painel de operação.</p>;
  const r = q.data;
  const nps = npsScore({
    promoters: r.satisfaction.nps_promoters,
    passives: r.satisfaction.nps_passives,
    detractors: r.satisfaction.nps_detractors,
  });
  const s = r.service;
  return (
    <div className="space-y-6">
      <Lede eyebrow="Central de atendimento" headline={opsHeadline(s)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          dark
          icon={Gauge}
          label={`Nível de serviço (até ${s.sla_seconds} s)`}
          value={s.service_level === null ? "—" : `${s.service_level}%`}
          sub={`${formatNumber(s.answered)} de ${formatNumber(s.inbound)} recebidas atendidas`}
        />
        <Kpi
          icon={PhoneMissed}
          label="Abandono"
          value={s.inbound ? `${Math.round((100 * s.abandoned) / s.inbound)}%` : "—"}
          sub={`${formatNumber(s.abandoned)} desistiram antes de atender`}
        />
        <Kpi
          icon={Clock}
          label="Espera média"
          value={secs(s.avg_wait_seconds)}
          sub={`Conversa média ${secs(s.avg_talk_seconds)}`}
        />
        <Kpi
          icon={Smile}
          label="NPS do período"
          value={nps === null ? "—" : String(nps)}
          sub={
            r.satisfaction.csat_avg === null
              ? "Sem CSAT respondido"
              : `CSAT ${Number(r.satisfaction.csat_avg).toFixed(1)} de 5`
          }
        />
      </div>

      <Panel
        title="Nível de serviço por dia"
        hint="Ligações recebidas por pessoas, atendidas dentro do tempo da fila"
      >
        {s.daily.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-foreground">
            Nenhuma ligação recebida no período.
          </p>
        ) : (
          <ChartContainer config={levelConfig} className="h-56 w-full">
            <BarChart
              data={s.daily.map((d) => ({
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
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={32}
                unit="%"
              />
              <ReferenceLine y={80} stroke="var(--border)" strokeDasharray="4 4" />
              <ChartTooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={<ChartTooltipContent />}
              />
              <Bar dataKey="level" fill="var(--color-level)" radius={BAR_RADIUS} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        )}
      </Panel>
      <Panel
        title="Desempenho da equipe"
        hint={`Ocupação = tempo falando sobre 8 h por dia útil (${s.business_days} dias). É uma estimativa.`}
      >
        <PerfTable
          rows={s.agents}
          rowKey={(a) => a.user_id}
          caption="Desempenho da equipe na central"
          empty="Nenhuma ligação atendida por pessoas no período."
          columns={[
            { label: "Atendente", render: (a) => <span className="font-medium">{a.name}</span> },
            { label: "Ligações", numeric: true, render: (a) => formatNumber(a.calls) },
            {
              label: "Minutos falando",
              numeric: true,
              render: (a) => formatNumber(a.talk_minutes),
            },
            {
              label: "Ocupação",
              numeric: true,
              render: (a) =>
                a.occupancy === null ? "—" : <span className="font-medium">{a.occupancy}%</span>,
            },
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <SatisfactionPanel r={r} nps={nps} />
        <CostPanel r={r} />
      </div>

      <CplPanel accountId={accountId} r={r} />
    </div>
  );
}

function SatisfactionPanel({ r, nps }: { r: OpsReport; nps: number | null }) {
  const sat = r.satisfaction;
  const npsTotal = sat.nps_promoters + sat.nps_passives + sat.nps_detractors;
  return (
    <Panel
      title="Satisfação"
      hint={`${formatNumber(sat.csat_responses)} de ${formatNumber(sat.csat_sent)} pesquisas de CSAT respondidas · ${formatNumber(npsTotal)} respostas de NPS`}
    >
      <BarList
        rows={[5, 4, 3, 2, 1].map((n) => ({
          label: `${n} ${n === 1 ? "estrela" : "estrelas"}`,
          value: Number(sat.csat_dist[String(n)] ?? 0),
        }))}
        format={formatNumber}
        empty="Sem CSAT no período."
      />
      <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[12px]">
        {[
          { label: "Promotores", v: sat.nps_promoters, tone: "text-foreground" },
          { label: "Neutros", v: sat.nps_passives, tone: "text-muted-foreground" },
          { label: "Detratores", v: sat.nps_detractors, tone: "text-danger" },
        ].map((x) => (
          <div key={x.label} className="rounded-2xl bg-surface-2 px-2 py-3">
            <p className={`font-display text-[20px] font-semibold tabular-nums ${x.tone}`}>
              {formatNumber(x.v)}
            </p>
            <p className="text-subtle">{x.label}</p>
          </div>
        ))}
      </div>
      {nps !== null && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          NPS {nps}: promotores menos detratores, em porcentagem das respostas.
        </p>
      )}
    </Panel>
  );
}

function CostPanel({ r }: { r: OpsReport }) {
  const c = r.costs;
  const kinds = Object.entries(c.by_kind).map(([k, v]) => ({
    label: COST_KIND[k] ?? k,
    value: Number(v),
  }));
  return (
    <Panel
      title="Custo por conversa e por ligação"
      hint="Consumo registrado na carteira, em dólar. Só gestores veem."
    >
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="font-display text-[20px] font-semibold tabular-nums">
            {usd(perUnit(Number(c.conversation_usd), c.conversations))}
          </p>
          <p className="text-[12px] text-subtle">
            por conversa ({formatNumber(c.conversations)} no período)
          </p>
          <p className="mt-1 text-[11px] text-subtle">IA do atendimento e modelos de WhatsApp</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="font-display text-[20px] font-semibold tabular-nums">
            {usd(perUnit(Number(c.call_usd), c.calls))}
          </p>
          <p className="text-[12px] text-subtle">
            por ligação ({formatNumber(c.calls)} no período)
          </p>
          <p className="mt-1 text-[11px] text-subtle">Minutos, IA de voz, transcrição e resumo</p>
        </div>
      </div>
      <BarList
        rows={kinds}
        format={(v) => USD.format(v)}
        empty="Nenhum consumo registrado no período."
      />
    </Panel>
  );
}

function CplPanel({ accountId, r }: { accountId: string; r: OpsReport }) {
  const { isManager } = useAccount();
  const cpl = costPerLead(r.leads.by_channel);
  const period =
    r.leads.months_from === r.leads.months_to
      ? monthLabel(r.leads.months_from)
      : `${monthLabel(r.leads.months_from)} a ${monthLabel(r.leads.months_to)}`;
  return (
    <Panel
      title="Custo por lead"
      hint={`Verba informada ÷ leads pelo primeiro toque, nos meses do período (${period}). Leads: ${formatNumber(r.leads.total)}.`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] tracking-wide text-subtle uppercase">
                <th className="py-1.5 font-medium">Canal</th>
                <th className="py-1.5 text-right font-medium">Leads</th>
                <th className="py-1.5 text-right font-medium">Verba</th>
                <th className="py-1.5 text-right font-medium">Por lead</th>
              </tr>
            </thead>
            <tbody>
              {cpl.rows.map((x) => (
                <tr key={x.channel} className="border-t border-border">
                  <td className="py-2 capitalize">{x.channel}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(x.leads)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {x.spend === null ? "—" : formatMoney(x.spend)}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {x.cpl === null ? "—" : formatMoney(x.cpl)}
                  </td>
                </tr>
              ))}
              {cpl.total.spend ? (
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2">{cpl.total.channel}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(cpl.total.leads)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(cpl.total.spend ?? 0)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {cpl.total.cpl === null ? "—" : formatMoney(cpl.total.cpl)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {cpl.rows.length === 0 && (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              Nenhum lead nem verba no período.
            </p>
          )}
        </div>
        {isManager ? (
          <AdSpendEditor
            accountId={accountId}
            channels={r.leads.by_channel.map((x) => x.channel)}
          />
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Só gestores informam a verba de mídia.
          </p>
        )}
      </div>
    </Panel>
  );
}

function AdSpendEditor({ accountId, channels }: { accountId: string; channels: string[] }) {
  const list = useAdSpend(accountId);
  const save = useSaveAdSpend(accountId);
  const remove = useDeleteAdSpend(accountId);
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [channel, setChannel] = useState("");
  const [amount, setAmount] = useState("");
  const parsed = parseAmount(amount);
  const invalid = !channel.trim() || parsed === null || !/^\d{4}-\d{2}$/.test(month);

  function submit() {
    if (invalid || parsed === null) return;
    save.mutate(
      { month: monthStart(month), channel, amount: parsed },
      {
        onSuccess: () => {
          setAmount("");
          toast.success("Verba salva");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] font-medium">Verba de mídia por mês e canal</p>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div className="grid gap-1">
          <Label htmlFor="ad-month" className="text-[11px] text-subtle">
            Mês
          </Label>
          <Input
            id="ad-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ad-amount" className="text-[11px] text-subtle">
            Valor (R$)
          </Label>
          <Input
            id="ad-amount"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amount !== "" && parsed === null}
            className="h-9"
          />
        </div>
        <div className="col-span-2 grid gap-1">
          <Label htmlFor="ad-channel" className="text-[11px] text-subtle">
            Canal (igual à origem do lead)
          </Label>
          <Input
            id="ad-channel"
            list="ad-channels"
            placeholder="google, meta, linkedin…"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="h-9"
          />
          <datalist id="ad-channels">
            {channels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <Button type="submit" size="sm" className="col-span-2" disabled={invalid || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />} Salvar verba
        </Button>
      </form>
      {(list.data ?? []).length > 0 && (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-2xl border border-border text-[12px]">
          {(list.data ?? []).map((x) => (
            <li key={x.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-16 text-subtle">{monthLabel(x.month.slice(0, 7))}</span>
              <span className="min-w-0 flex-1 truncate capitalize">{x.channel}</span>
              <span className="tabular-nums">{formatMoney(x.amount)}</span>
              <button
                type="button"
                aria-label={`Apagar verba de ${x.channel}`}
                onClick={() =>
                  remove.mutate(x.id, { onError: (e) => toast.error(errorMessage(e)) })
                }
                className="rounded-full p-1 text-subtle hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
