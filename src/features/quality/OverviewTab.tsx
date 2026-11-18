import { useMemo, useState } from "react";
import { AlertTriangle, Bot, Gauge, MessageSquareWarning, Scale } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamMembers } from "@/features/contacts/api";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useEvaluations,
  useQualityOverview,
  useQualitySettings,
  useQualitySpend,
  useScoreSample,
  type QualityEvaluation,
} from "./api";
import { EvaluationSheet } from "./EvaluationSheet";
import { agreementLabel, previousAverage, scoreBuckets } from "./overview";
import {
  DistributionCard,
  Panel,
  RecentEvaluationsCard,
  ReducersCard,
  ScoreRingCard,
} from "./OverviewCards";
import type { QualityTab } from "./QualityPage";
import { ScoreBadge } from "./ScoreBadge";

export function OverviewTab({
  accountId,
  isManager,
  onTab,
}: {
  accountId: string;
  isManager: boolean;
  onTab: (t: QualityTab) => void;
}) {
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState<string | null>(null);
  const o = useQualityOverview(accountId, days);
  const wide = useQualityOverview(accountId, days * 2);
  const sample = useScoreSample(accountId, days);
  const recent = useEvaluations(accountId, { channel: "all", agent: "all", status: "done", days });
  const spend = useQualitySpend(accountId);
  const settings = useQualitySettings(accountId);
  const team = useTeamMembers(accountId);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const buckets = useMemo(() => scoreBuckets(sample.data ?? []), [sample.data]);

  if (o.isPending) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (o.isError)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Não deu para carregar a qualidade"
        description={errorMessage(o.error)}
      />
    );
  const d = o.data;

  if (d.evaluated === 0 && d.errors === 0 && d.skipped === 0)
    return (
      <EmptyState
        icon={Gauge}
        title="Nenhuma interação avaliada ainda"
        description="Com um formulário de qualidade ativo, toda conversa que terminar ganha nota da IA, com o trecho como prova."
        action={
          isManager ? (
            <Button onClick={() => onTab("formularios")}>Configurar o formulário</Button>
          ) : undefined
        }
      />
    );

  const nameOf = (e: QualityEvaluation) =>
    e.is_ai
      ? "Agente de IA"
      : e.agent_user_id
        ? (names.get(e.agent_user_id) ?? "Atendente")
        : "Sem responsável";
  const evaluations = recent.data ?? [];
  const current = evaluations.find((e) => e.id === open);
  const previous = wide.data ? previousAverage(d, wide.data) : null;
  const budget = Number(settings.data?.monthly_budget_usd ?? 20);
  const used = spend.data?.month_usd ?? 0;
  const agreement = agreementLabel(d.agreement);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {d.evaluated} interações com nota
          {d.skipped > 0 && ` · ${d.skipped} puladas`}
          {d.errors > 0 && ` · ${d.errors} com erro`}
        </p>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-9 w-40" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <ScoreRingCard overview={d} previous={previous} days={days} />
        <DistributionCard buckets={buckets} loading={sample.isPending} error={sample.error} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <section
            aria-labelledby="q-cal"
            className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="q-cal" className="text-[14px] font-medium">
                  Concordância da calibração
                </h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {d.calibrations
                    ? `IA e gestor batem em ${d.calibrations} reavaliações`
                    : "Reavalie uma amostra para medir"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[32px] leading-none font-semibold tabular-nums">
                  {d.agreement === null ? "—" : `${Math.round(d.agreement)}%`}
                </p>
                {agreement && (
                  <span className="mt-1.5 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium">
                    {agreement}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onTab("calibracao")}
              className="inline-flex items-center gap-1.5 self-start rounded-full text-[12px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Scale className="size-3.5" aria-hidden /> Abrir a calibração
            </button>
          </section>
          <section
            aria-labelledby="q-disp"
            className={cn(
              "flex flex-col justify-between gap-4 rounded-2xl border p-5 sm:p-6",
              d.disputes_open > 0
                ? "border-primary/30 bg-primary-soft"
                : "border-border bg-surface",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="q-disp" className="text-[14px] font-medium">
                  Contestações
                </h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Notas que o atendente pediu para revisar
                </p>
              </div>
              <MessageSquareWarning className="size-5 text-primary" aria-hidden />
            </div>
            <div className="flex items-end justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                <span className="mr-1.5 font-display text-[32px] leading-none font-semibold text-foreground tabular-nums">
                  {d.disputes_open}
                </span>
                {d.disputes_open === 1 ? "pendente" : "pendentes"}
              </p>
              <Button
                size="sm"
                variant={d.disputes_open > 0 ? "default" : "outline"}
                onClick={() => onTab("contestacoes")}
              >
                {d.disputes_open > 0 ? "Revisar agora" : "Ver histórico"}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ReducersCard
          accountId={accountId}
          overview={d}
          evaluations={evaluations}
          canCreate={isManager}
          onOpen={setOpen}
        />
        <RecentEvaluationsCard
          accountId={accountId}
          evaluations={evaluations}
          nameOf={nameOf}
          onOpen={setOpen}
          onSeeAll={() => onTab("notas")}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel id="q-agents" title="Por atendente" hint={`Média dos últimos ${days} dias`}>
          {d.by_agent.length === 0 ? (
            <p className="mx-5 mb-5 text-[13px] text-muted-foreground sm:mx-6">
              Sem avaliações no período.
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {d.by_agent.map((a) => (
                <li
                  key={`${a.user_id}-${a.is_ai}`}
                  className="flex items-center gap-3 px-5 py-2.5 text-[13px] sm:px-6"
                >
                  {a.is_ai && <Bot className="size-4 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">
                    {a.is_ai
                      ? "Agentes de IA"
                      : a.user_id
                        ? (names.get(a.user_id) ?? "Atendente")
                        : "Sem responsável"}
                  </span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">
                    {a.n} {a.n === 1 ? "nota" : "notas"}
                  </span>
                  {a.eliminated > 0 && (
                    <span className="text-[11px] text-danger tabular-nums">
                      {a.eliminated} elim.
                    </span>
                  )}
                  <ScoreBadge score={a.avg} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel id="q-spend" title="Gasto do avaliador no mês" hint="Chave de IA da sua empresa">
          <div className="px-5 pb-5 sm:px-6">
            <p className="font-display text-[28px] font-semibold tabular-nums">
              US$ {used.toFixed(2)}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div
                className={cn(
                  "h-full origin-left rounded-full",
                  used >= budget ? "bg-danger" : "bg-primary",
                )}
                style={{ transform: `scaleX(${Math.min(1, budget ? used / budget : 0)})` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Teto de US$ {budget.toFixed(2)} por mês.{" "}
              {isManager && (
                <button
                  type="button"
                  onClick={() => onTab("ajustes")}
                  className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Ajustar
                </button>
              )}
            </p>
          </div>
        </Panel>
      </div>

      <EvaluationSheet
        accountId={accountId}
        evaluationId={open}
        agentName={current ? nameOf(current) : ""}
        isManager={isManager}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
