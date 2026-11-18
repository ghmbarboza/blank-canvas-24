import { useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChevronRight,
  GraduationCap,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Quote,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trainingKeys } from "@/features/training/api";
import { formatListTime, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useContactNames,
  useQualityAction,
  type QualityEvaluation,
  type QualityOverview,
} from "./api";
import { bucketsSentence, evidenceByCriterion, type ScoreBucket } from "./overview";
import { ScoreBadge } from "./ScoreBadge";
import { CHANNEL_LABEL, qualityChannelsFor, type QualityChannel } from "./scoring";

const CHANNEL_ICON: Record<QualityChannel, typeof Phone> = {
  call: Phone,
  chat: MessageCircle,
  email: Mail,
};

export function Panel({
  id,
  title,
  hint,
  aside,
  className,
  children,
}: {
  id: string;
  title: string;
  hint?: string | undefined;
  aside?: ReactNode;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col rounded-2xl border border-border bg-surface", className)}
    >
      <header className="flex items-start gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={id} className="text-[14px] font-medium text-foreground">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

const RING_R = 45;
const RING_C = 2 * Math.PI * RING_R;

// Destaque da tela: o anel da nota média, com a variação contra o período anterior.
export function ScoreRingCard({
  overview: d,
  previous,
  days,
}: {
  overview: QualityOverview;
  previous: number | null;
  days: number;
}) {
  const avg = d.avg_score === null ? null : Math.round(d.avg_score);
  const delta =
    avg !== null && previous !== null ? Math.round((d.avg_score! - previous) * 10) / 10 : null;
  return (
    <Panel id="q-ring" title="Nota média de qualidade" hint={`${d.evaluated} interações avaliadas`}>
      <div className="flex flex-1 flex-col items-center px-5 pb-5 sm:px-6">
        <div className="relative my-2 size-40">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle
              cx="50"
              cy="50"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-surface-3"
            />
            <circle
              cx="50"
              cy="50"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - (avg ?? 0) / 100)}
              className="text-primary"
            />
          </svg>
          <p className="absolute inset-0 grid place-content-center text-center">
            <span className="font-display text-5xl font-semibold text-foreground tabular-nums">
              {avg ?? "—"}
            </span>
            <span className="text-[12px] text-subtle">de 100</span>
          </p>
        </div>
        <ul className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
          {qualityChannelsFor().map((c) => {
            const x = d.by_channel[c];
            return (
              <li key={c} className="rounded-lg bg-surface-2 px-2 py-1.5">
                <p className="truncate text-[11px] text-muted-foreground">{CHANNEL_LABEL[c]}</p>
                <p className="text-[13px] font-semibold tabular-nums">
                  {x?.avg != null ? Math.round(x.avg) : "—"}
                  <span className="ml-1 text-[11px] font-normal text-subtle">({x?.n ?? 0})</span>
                </p>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex w-full items-center justify-between gap-2 border-t border-border pt-4 text-[13px]">
          <span className="text-muted-foreground">vs. {days} dias anteriores</span>
          {delta === null ? (
            <span className="text-[11px] text-subtle">sem base anterior</span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-foreground tabular-nums">
              {delta < 0 ? (
                <ArrowDownRight className="size-3" aria-hidden />
              ) : delta > 0 ? (
                <ArrowUpRight className="size-3" aria-hidden />
              ) : null}
              {delta > 0 ? "+" : ""}
              {delta.toLocaleString("pt-BR")} pts
            </span>
          )}
        </div>
        {d.eliminated > 0 && (
          <p className="mt-2 w-full text-[12px] text-danger">
            {d.eliminated} {d.eliminated === 1 ? "eliminada" : "eliminadas"} por item obrigatório
          </p>
        )}
      </div>
    </Panel>
  );
}

const BAR_TONE: Record<ScoreBucket["key"], string> = {
  top: "bg-primary",
  good: "bg-chart-2",
  mid: "bg-chart-3",
  low: "bg-chart-4",
};

export function DistributionCard({
  buckets,
  loading,
  error,
}: {
  buckets: ScoreBucket[];
  loading: boolean;
  error: unknown;
}) {
  return (
    <Panel
      id="q-dist"
      title="Distribuição das notas"
      hint="Quantas interações caíram em cada faixa"
    >
      <div className="flex flex-1 flex-col px-5 pb-5 sm:px-6">
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <p className="text-[13px] text-danger">{errorMessage(error)}</p>
        ) : (
          <>
            <ul className="grid gap-3.5 py-2">
              {buckets.map((b) => (
                <li key={b.key} className="grid grid-cols-[88px_1fr_64px] items-center gap-3">
                  <span className="text-[12px] text-muted-foreground tabular-nums">{b.label}</span>
                  <span
                    className="h-2 overflow-hidden rounded-full bg-surface-3"
                    role="img"
                    aria-label={`${b.label}: ${b.count} interações, ${b.pct}%`}
                  >
                    <span
                      className={cn(
                        "block h-full origin-left rounded-full transition-transform duration-200",
                        BAR_TONE[b.key],
                      )}
                      style={{ transform: `scaleX(${b.pct / 100})` }}
                    />
                  </span>
                  <span className="text-right text-[12px] font-medium tabular-nums">
                    {b.pct}%<span className="ml-1 font-normal text-subtle">({b.count})</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-auto border-t border-border pt-4 text-[12px] leading-relaxed text-muted-foreground">
              {bucketsSentence(buckets)}
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}

// O que mais derruba a nota, com o trecho citado como prova e o atalho para treinar.
export function ReducersCard({
  accountId,
  overview,
  evaluations,
  canCreate,
  onOpen,
}: {
  accountId: string;
  overview: QualityOverview;
  evaluations: QualityEvaluation[];
  canCreate: boolean;
  onOpen: (evaluationId: string) => void;
}) {
  const qc = useQueryClient();
  const action = useQualityAction<{ id: string; name: string }>(accountId);
  const weak = useMemo(
    () =>
      overview.weak
        .filter((w) => w.fails > 0)
        .sort((a, b) => b.fails - a.fails)
        .slice(0, 4),
    [overview.weak],
  );
  const proof = useMemo(
    () =>
      evidenceByCriterion(
        evaluations,
        weak.map((w) => w.criterion_id),
      ),
    [evaluations, weak],
  );

  function train(criterionId: string, label: string) {
    action.mutate(
      { action: "training.scenario", criterionId, label },
      {
        onSuccess: (p) => {
          void qc.invalidateQueries({ queryKey: trainingKeys.personas(accountId) });
          toast.success(`Cenário criado no Treino: ${p.name}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <Panel
      id="q-reducers"
      title="O que mais derruba a nota"
      hint="Critérios mais reprovados no período, com o trecho da conversa como prova"
    >
      {weak.length === 0 ? (
        <p className="mx-5 mb-5 rounded-xl bg-surface-2 px-4 py-5 text-[13px] text-muted-foreground sm:mx-6">
          Nenhum critério reprovado no período. Quando as avaliações apontarem um ponto fraco, ele
          aparece aqui com o trecho e o atalho para treinar.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {weak.map((w) => {
            const ev = proof.get(w.criterion_id);
            const Icon = ev ? CHANNEL_ICON[ev.channel as QualityChannel] : null;
            return (
              <li key={w.criterion_id} className="px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 flex-1 text-[14px] font-medium text-foreground">
                    {w.label}
                  </h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                    {w.fails} de {w.n} reprovadas
                  </span>
                  {w.avg !== null && (
                    <span className="text-[11px] text-subtle tabular-nums">
                      média {Math.round(w.avg)}
                    </span>
                  )}
                </div>
                {ev ? (
                  <button
                    type="button"
                    onClick={() => onOpen(ev.evaluationId)}
                    className="group mt-3 block w-full rounded-r-lg border-l-2 border-border-strong py-1 pr-2 pl-4 text-left transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <p className="text-[13px] leading-relaxed text-muted-foreground italic">
                      <Quote
                        className="mr-1 inline size-3 -translate-y-0.5 text-subtle"
                        aria-hidden
                      />
                      {ev.quote}
                    </p>
                    {ev.comment && (
                      <p className="mt-1.5 text-[12px] text-foreground">{ev.comment}</p>
                    )}
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-subtle">
                      {Icon && <Icon className="size-3" aria-hidden />}
                      Prova · {CHANNEL_LABEL[ev.channel as QualityChannel] ?? ev.channel} ·{" "}
                      {formatRelative(ev.createdAt)}
                      <ChevronRight
                        className="size-3 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </p>
                  </button>
                ) : (
                  <p className="mt-2 text-[12px] text-subtle">
                    Sem trecho citado nas avaliações mais recentes.
                  </p>
                )}
                {canCreate && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => train(w.criterion_id, w.label)}
                    disabled={action.isPending}
                    aria-label={`Criar cenário de treino para ${w.label}`}
                  >
                    {action.isPending && action.variables?.["criterionId"] === w.criterion_id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <GraduationCap />
                    )}
                    Treinar este ponto
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function RecentEvaluationsCard({
  accountId,
  evaluations,
  nameOf,
  onOpen,
  onSeeAll,
}: {
  accountId: string;
  evaluations: QualityEvaluation[];
  nameOf: (e: QualityEvaluation) => string;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}) {
  const rows = evaluations.slice(0, 7);
  const ids = useMemo(
    () => [...new Set(rows.map((e) => e.contact_id).filter((x): x is string => Boolean(x)))],
    [rows],
  );
  const contacts = useContactNames(accountId, ids);
  return (
    <Panel
      id="q-recent"
      title="Últimas avaliações"
      hint="Clique para ver critério a critério"
      aside={
        <Button size="sm" variant="outline" onClick={onSeeAll}>
          Ver todas
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="mx-5 mb-5 rounded-xl bg-surface-2 px-4 py-5 text-[13px] text-muted-foreground sm:mx-6">
          Nenhuma nota no período.
        </p>
      ) : (
        <div className="border-t border-border">
          <div
            className="hidden grid-cols-[1.1fr_1.3fr_0.8fr_64px] gap-3 border-b border-border px-6 py-2.5 sm:grid"
            aria-hidden
          >
            <span className="eyebrow">Atendente</span>
            <span className="eyebrow">Cliente e canal</span>
            <span className="eyebrow">Quando</span>
            <span className="eyebrow text-right">Nota</span>
          </div>
          <ul>
            {rows.map((e) => {
              const Icon = CHANNEL_ICON[e.channel as QualityChannel] ?? MessageCircle;
              const contact = e.contact_id ? contacts.data?.get(e.contact_id) : null;
              return (
                <li key={e.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpen(e.id)}
                    className="row-wash grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-5 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:grid-cols-[1.1fr_1.3fr_0.8fr_64px] sm:px-6"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                      {e.is_ai && <Bot className="size-3.5 shrink-0 text-subtle" aria-hidden />}
                      <span className="truncate">{nameOf(e)}</span>
                    </span>
                    <span className="col-start-1 row-start-2 flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground sm:col-start-auto sm:row-start-auto sm:text-[13px]">
                      <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden />
                      <span className="sr-only">
                        {CHANNEL_LABEL[e.channel as QualityChannel] ?? e.channel}:
                      </span>
                      <span className="truncate">
                        {contact ?? CHANNEL_LABEL[e.channel as QualityChannel] ?? e.channel}
                      </span>
                    </span>
                    <span className="hidden text-[12px] text-subtle tabular-nums sm:block">
                      {formatListTime(e.created_at)}
                    </span>
                    <span className="row-span-2 justify-self-end sm:row-span-1">
                      <ScoreBadge score={e.score} eliminated={e.eliminated} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
