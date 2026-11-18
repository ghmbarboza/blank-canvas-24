import type { ReactNode } from "react";
import { HeartHandshake, Inbox, Smile, Timer, Users } from "lucide-react";

import type { PortfolioSummary } from "@/features/gestao/health";
import type { SacMetrics } from "@/features/support/api";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { deltaPct, formatDuration, PERIODS, type Gerencial, type Period } from "./gerencial";
import { heroSummary, satisfaction, type RulesSummary } from "./overview";
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

/** O que o topo precisa além do painel gerencial; cada parte chega quando a consulta dela termina. */
export interface HeroExtras {
  /** Saúde da carteira; null enquanto carrega ou se a consulta falhou. */
  portfolio: PortfolioSummary | null;
  sac: SacMetrics | undefined;
  rules: RulesSummary | null;
}

interface Props {
  data: Gerencial;
  days: Period;
  onDays: (d: Period) => void;
  userName: string;
  extras: HeroExtras;
}

export function Hero({ data, days, onDays, userName, extras }: Props) {
  const k = data.kpis;
  const volume = data.daily.map((d) => d.in + d.out);
  const { portfolio: pf, sac, rules } = extras;
  const sat = satisfaction(sac);

  return (
    <div className="px-3 pt-3 md:px-5 md:pt-5">
      <section
        aria-label="Resumo do pós-venda"
        className="relative isolate mx-auto max-w-[1440px] overflow-hidden rounded-[28px] bg-[#001F35] px-5 pt-8 pb-6 text-white shadow-[0_40px_80px_-40px_rgba(2,22,42,0.75)] md:rounded-[36px] md:px-10 md:pt-11 md:pb-8"
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(900px 420px at 0% 0%, rgba(46,82,124,0.75), transparent 62%), radial-gradient(700px 360px at 100% 120%, rgba(30,58,95,0.6), transparent 60%), linear-gradient(180deg, #001F35 0%, #001626 100%)",
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
                Pós-venda · últimos {days} dias
              </p>
              <h1 className="mt-3 font-display text-[34px] leading-[1.05] font-medium md:text-[44px]">
                {greeting()}, {userName}
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
                {heroSummary({
                  conversations: k.conversations,
                  clients: pf ? pf.total : null,
                  risk: pf?.risk ?? 0,
                  waiting: k.waiting,
                })}
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
                      ? "bg-white text-[#001F35] shadow-sm"
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
              icon={Users}
              label="Clientes ativos"
              value={pf?.total ?? 0}
              render={(v) => (pf ? formatNumber(Math.round(v)) : "—")}
              delta={
                <Note tone={pf && pf.risk > 0 ? "alert" : "plain"}>
                  {!pf
                    ? "carregando a carteira"
                    : pf.total === 0
                      ? "ninguém marcado como cliente"
                      : pf.risk > 0
                        ? `${formatNumber(pf.risk)} em risco`
                        : "nenhum em risco"}
                </Note>
              }
              foot={
                pf && pf.total > 0
                  ? `${formatNumber(pf.healthy)} saudáveis · ${formatNumber(pf.attention)} em atenção`
                  : "Mude a fase do contato para Cliente"
              }
            />
            <Kpi
              icon={Inbox}
              label="Conversas aguardando"
              value={k.waiting}
              render={(v) => formatNumber(Math.round(v))}
              delta={<Note>{countLabel(k.open_conversations, "aberta")} agora</Note>}
              foot={
                k.oldest_waiting_at
                  ? `A mais antiga chegou ${formatRelative(k.oldest_waiting_at)}`
                  : "Ninguém esperando resposta"
              }
            />
            <Kpi
              icon={Timer}
              label="Tempo da 1ª resposta"
              value={k.frt_avg ?? 0}
              render={(v) => (k.frt_avg === null ? "—" : formatDuration(v))}
              delta={
                k.frt_avg === null ? (
                  <Note>sem conversa no período</Note>
                ) : (
                  <Delta value={deltaPct(k.frt_avg, k.frt_avg_prev)} invert onDark />
                )
              }
              foot={
                k.frt_sla_pct === null
                  ? "Meta: responder em até 5 min"
                  : `${k.frt_sla_pct}% respondidas em até 5 min`
              }
              spark={data.daily.map((d) => d.frt)}
              pill={k.ai_answered > 0 ? `${formatNumber(k.ai_answered)} pela IA` : undefined}
            />
            <Kpi
              icon={Smile}
              label={sat.kind === "csat" ? "Satisfação (nota média)" : "Satisfação (NPS)"}
              value={
                sat.kind === "nps"
                  ? (sac?.nps ?? 0)
                  : sat.kind === "csat"
                    ? (sac?.csat_avg ?? 0)
                    : 0
              }
              render={(v) =>
                sat.kind === "nps"
                  ? String(Math.round(v))
                  : sat.kind === "csat"
                    ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/5`
                    : "—"
              }
              delta={
                <Note>
                  {sat.kind === "none" ? "sem resposta ainda" : `nos últimos ${days} dias`}
                </Note>
              }
              foot={sat.foot}
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
            {sac && (
              <>
                <Now
                  label={sac.open === 1 ? "chamado aberto" : "chamados abertos"}
                  value={sac.open}
                />
                <Now
                  label="com prazo estourado"
                  value={sac.breached_open}
                  strong={sac.breached_open > 0}
                />
              </>
            )}
            {rules && (
              <li>
                <span className="font-semibold text-white tabular-nums">
                  {rules.on} de {rules.total}
                </span>{" "}
                regras de pós-venda ligadas
              </li>
            )}
            {rules && rules.reached > 0 && (
              <li className="flex items-center gap-1.5">
                <HeartHandshake className="size-3.5 text-white/45" aria-hidden />
                <span className="font-semibold text-white tabular-nums">
                  {formatNumber(rules.reached)}
                </span>{" "}
                {rules.reached === 1 ? "cliente passou" : "clientes passaram"} por elas
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Note({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "alert" }) {
  return (
    <span
      className={cn(
        "text-[12px] font-medium",
        tone === "alert" ? "text-[#F0B4B4]" : "text-white/60",
      )}
    >
      {children}
    </span>
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
