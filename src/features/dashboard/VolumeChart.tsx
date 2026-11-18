import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import { formatNumber } from "@/lib/format";

import type { DailyRow } from "./gerencial";
import { Card, EmptyNote } from "./ui";

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length || typeof label !== "string") return null;
  const row = payload[0]?.payload as DailyRow | undefined;
  if (!row) return null;
  return (
    <div className="min-w-44 rounded-xl border border-white/10 bg-[#001626] p-3 text-white shadow-pop">
      <p className="text-[11px] text-white/60 first-letter:uppercase">
        {format(parseISO(label), "EEEE, d 'de' MMM", { locale: ptBR })}
      </p>
      <dl className="mt-2 space-y-1 text-[13px]">
        <Row color="#9FBDE4" label="Recebidas" value={row.in} />
        <Row color="#5E7B9E" label="Enviadas" value={row.out} />
        <Row color="#FFFFFF" label="Contatos novos" value={row.leads} />
      </dl>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      <dt className="flex-1 text-white/70">{label}</dt>
      <dd className="font-semibold tabular-nums">{formatNumber(value)}</dd>
    </div>
  );
}

export function VolumeChart({ daily, className }: { daily: DailyRow[]; className?: string }) {
  const avg = useMemo(() => {
    const days = daily.filter((d) => d.in > 0);
    return days.length ? Math.round(days.reduce((s, d) => s + d.in, 0) / days.length) : 0;
  }, [daily]);
  const peak = useMemo(
    () => daily.reduce((best, d) => (d.in > (best?.in ?? -1) ? d : best), daily[0]),
    [daily],
  );
  const hasData = daily.some((d) => d.in + d.out > 0);

  return (
    <Card
      id="painel-volume"
      eyebrow="Volume de conversas"
      title={
        hasData && peak
          ? `Pico em ${format(parseISO(peak.day), "d 'de' MMM", { locale: ptBR })}, com ${formatNumber(peak.in)} mensagens recebidas`
          : "Mensagens por dia"
      }
      aside={
        <div className="hidden items-center gap-4 text-[12px] text-muted-foreground sm:flex">
          <Legend className="bg-chart-1" label="Recebidas" />
          <Legend className="bg-chart-3" label="Enviadas" />
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-muted-foreground" aria-hidden />{" "}
            Média
          </span>
        </div>
      }
      link={{ to: "/inbox", label: "Abrir caixa de entrada" }}
      className={className}
    >
      {!hasData ? (
        <EmptyNote>Sem mensagens no período.</EmptyNote>
      ) : (
        <div className="-mx-2 min-h-64 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 8, right: 20, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="vol-in" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="vol-out" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fill: "var(--subtle-fg)", fontSize: 11, fontFamily: "JetBrains Mono" }}
                tickFormatter={(d: string) => format(parseISO(d), "d MMM", { locale: ptBR })}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={false}
                tick={{ fill: "var(--subtle-fg)", fontSize: 11, fontFamily: "JetBrains Mono" }}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              />
              {avg > 0 && (
                <ReferenceLine
                  y={avg}
                  stroke="var(--muted-fg)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
              )}
              <Area
                type="monotone"
                dataKey="out"
                stroke="var(--chart-3)"
                strokeWidth={1.75}
                fill="url(#vol-out)"
                animationDuration={900}
              />
              <Area
                type="monotone"
                dataKey="in"
                stroke="var(--chart-1)"
                strokeWidth={2.25}
                fill="url(#vol-in)"
                animationDuration={900}
                activeDot={{
                  r: 4,
                  stroke: "var(--surface)",
                  strokeWidth: 2,
                  fill: "var(--chart-1)",
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${className}`} aria-hidden />
      {label}
    </span>
  );
}
