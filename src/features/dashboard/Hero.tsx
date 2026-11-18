import type { ReactNode } from "react";
import { Bot, Clock3, Flame, Inbox, MessagesSquare, Timer } from "lucide-react";

import { formatMoney, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { deltaPct, formatDuration, PERIODS, type Gerencial, type Period } from "./gerencial";
import { Delta, Sparkline } from "./ui";
import { useCountUp } from "./use-count-up";
import { countLabel } from "@/lib/plural";

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// Frase-resumo editorial: só afirma o que o número sustenta.
function summary(g: Gerencial): string {
  const k = g.kpis;
  if (k.conversations === 0)
    return "Nenhuma conversa no período ainda. Assim que um canal receber mensagens, o resumo aparece aqui.";
  const parts = [`Sua operação atendeu ${countLabel(k.conversations, "conversa")}`];
  const frtDelta = deltaPct(k.frt_avg, k.frt_avg_prev);
  if (k.frt_avg !== null) {
    parts.push(
      frtDelta !== null && frtDelta < 0
        ? `com primeira resposta em ${formatDuration(k.frt_avg)}, ${Math.abs(frtDelta)}% mais rápido que no período anterior`
        : `com primeira resposta média de ${formatDuration(k.frt_avg)}`,
    );
  }
  return `${parts.join(" ")}.`;
}

interface Props {
  data: Gerencial;
  days: Period;
  onDays: (d: Period) => void;
  userName: string;
}

export function Hero({ data, days, onDays, userName }: Props) {
  const k = data.kpis;
  const volume = data.daily.map((d) => d.in + d.out);
  const winRate =
    k.won_count + k.lost_count > 0
      ? Math.round((100 * k.won_count) / (k.won_count + k.lost_count))
      : null;

  return (
    <div className="px-3 pt-3 md:px-5 md:pt-5">
      <section
        aria-label="Resumo da operação"
        className="relative isolate mx-auto max-w-[1440px] overflow-hidden rounded-[28px] bg-[#0A1F3B] px-5 pt-8 pb-6 text-white shadow-[0_40px_80px_-40px_rgba(2,22,42,0.75)] md:rounded-[36px] md:px-10 md:pt-11 md:pb-8"
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(900px 420px at 0% 0%, rgba(46,82,124,0.75), transparent 62%), radial-gradient(700px 360px at 100% 120%, rgba(30,58,95,0.6), transparent 60%), linear-gradient(180deg, #0A1F3B 0%, #02162A 100%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05] mix-blend-overlay"
          style={{ backgroundImage: NOISE }}
          aria-hidden
        />
        {/* Luzes que derivam devagar: dão fluidez sem roubar a leitura. */}
        <div
          className="hero-orb pointer-events-none absolute -top-40 -left-24 -z-10 size-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(94,123,158,0.55), transparent 65%)" }}
          aria-hidden
        />
        <div
          className="hero-orb hero-orb--late pointer-events-none absolute -right-32 -bottom-48 -z-10 size-[560px] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(51,83,121,0.6), transparent 65%)" }}
          aria-hidden
        />
        {/* A própria série do período, suavizada, como uma onda ao fundo. */}
        <Sparkline
          values={volume}
          stroke="rgba(255,255,255,0.6)"
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 w-full opacity-[0.14]"
        />

        <div className="mx-auto max-w-[1400px]">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-medium tracking-[0.18em] text-white/55 uppercase">
                Operação · últimos {days} dias
              </p>
              <h1 className="mt-3 font-display text-[34px] leading-[1.05] font-medium md:text-[44px]">
                {greeting()}, {userName}
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
                {summary(data)}
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Período"
              className="inline-flex shrink-0 items-center self-start rounded-full border border-white/15 bg-white/[0.07] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-md md:self-auto"
            >
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={days === p}
                  onClick={() => onDays(p)}
                  className={cn(
                    "h-8 rounded-full px-4 text-[12px] font-medium tabular-nums transition-[background-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none",
                    days === p
                      ? "bg-white text-[#0A1F3B] shadow-sm"
                      : "text-white/65 hover:text-white",
                  )}
                >
                  {p} dias
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={MessagesSquare}
              label="Conversas atendidas"
              value={k.conversations}
              render={(v) => formatNumber(Math.round(v))}
              delta={<Delta value={deltaPct(k.conversations, k.conversations_prev)} onDark />}
              foot={`${formatNumber(k.messages_in)} recebidas · ${formatNumber(k.messages_out)} enviadas`}
              spark={volume}
            />
            <Kpi
              icon={Timer}
              label="1ª resposta nas conversas"
              value={k.frt_avg ?? 0}
              render={(v) => (k.frt_avg === null ? "—" : formatDuration(v))}
              delta={<Delta value={deltaPct(k.frt_avg, k.frt_avg_prev)} invert onDark />}
              foot={
                k.frt_sla_pct === null ? "SLA de 5 min" : `${k.frt_sla_pct}% dentro do SLA de 5 min`
              }
              spark={data.daily.map((d) => d.frt)}
              pill={k.ai_answered > 0 ? `${formatNumber(k.ai_answered)} pela IA` : undefined}
            />
            <Kpi
              icon={Inbox}
              label="Receita no funil"
              value={k.pipeline_value}
              render={(v) => formatMoney(v, true)}
              delta={
                <span className="text-[12px] font-medium text-white/60">
                  {countLabel(k.pipeline_count, "negócio")}
                </span>
              }
              foot={
                k.pipeline_potential > k.pipeline_value
                  ? `Potencial com upsell e cross-sell ${formatMoney(k.pipeline_potential, true)}`
                  : `Previsão ponderada ${formatMoney(k.forecast_value, true)}`
              }
            />
            <Kpi
              icon={Flame}
              label="Receita ganha"
              value={k.won_value}
              render={(v) => formatMoney(v, true)}
              delta={<Delta value={deltaPct(k.won_value, k.won_value_prev)} onDark />}
              foot={`${formatNumber(k.won_count)} ganhos${winRate === null ? "" : ` · ${winRate}% de taxa de ganho`}`}
            />
          </div>

          <ul
            aria-label="Agora"
            className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/70"
          >
            <li className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#6FD3A4] opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-[#6FD3A4]" />
              </span>
              <span className="text-white/50">Agora</span>
            </li>
            <Now label="conversas abertas" value={k.open_conversations} />
            <Now label="aguardando resposta" value={k.waiting} strong={k.waiting > 0} />
            {k.oldest_waiting_at && (
              <li className="flex items-center gap-1.5">
                <Clock3 className="size-3.5 text-white/45" aria-hidden />
                mais antiga {formatRelative(k.oldest_waiting_at)}
              </li>
            )}
            <Now label="leads quentes" value={k.hot_leads} />
            <li className="flex items-center gap-1.5">
              <Bot className="size-3.5 text-white/45" aria-hidden />
              <span className="font-semibold text-white tabular-nums">
                {formatNumber(k.classified)}
              </span>{" "}
              classificados pela IA
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Now({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <li>
      <span className={cn("font-semibold tabular-nums", strong ? "text-white" : "text-white/90")}>
        {formatNumber(value)}
      </span>{" "}
      {label}
    </li>
  );
}

interface KpiProps {
  icon: typeof Inbox;
  label: string;
  value: number;
  render: (v: number) => string;
  delta: ReactNode;
  foot: string;
  spark?: (number | null)[];
  pill?: string | undefined;
}

// Métrica em vidro líquido escuro sobre o navy: translúcida, borda luminosa fina, sem bloco sólido.
function Kpi({ icon: Icon, label, value, render, delta, foot, spark, pill }: KpiProps) {
  const animated = useCountUp(value);
  return (
    <article className="group @container relative isolate overflow-hidden rounded-[26px] border border-white/[0.12] bg-[linear-gradient(160deg,rgba(255,255,255,0.13)_0%,rgba(255,255,255,0.05)_45%,rgba(255,255,255,0.03)_100%)] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_48px_-28px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-[transform,background-color,border-color] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-1 hover:border-white/25">
      <span
        className="pointer-events-none absolute -top-16 -right-10 -z-10 size-40 rounded-full bg-white/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        aria-hidden
      />
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-white/10 ring-1 ring-white/15">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="flex-1 text-[11px] font-medium tracking-[0.14em] text-white/60 uppercase">
          {label}
        </p>
        {pill && (
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-[3px] text-[11px] font-medium text-white/80">
            {pill}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="font-display text-[30px] leading-none font-semibold whitespace-nowrap tabular-nums @[260px]:text-[34px]">
          {render(animated)}
        </p>
        {spark && (
          <Sparkline
            values={spark}
            stroke="#9FBDE4"
            className="mb-0.5 hidden h-10 w-24 shrink-0 @[330px]:block"
          />
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">{delta}</div>
      <p className="mt-1 text-[12px] text-white/55">{foot}</p>
    </article>
  );
}
