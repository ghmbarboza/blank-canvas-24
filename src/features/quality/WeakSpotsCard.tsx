import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, TrendingDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trainingKeys } from "@/features/training/api";
import { errorMessage } from "@/lib/functions";

import { useQualityAction, useQualityOverview } from "./api";
import { ScoreBar } from "./ScoreBadge";

// O que mais derruba a nota vira cenário de roleplay (liga a Qualidade ao Treino).
export function WeakSpotsCard({
  accountId,
  days = 30,
  canCreate,
  compact = false,
}: {
  accountId: string;
  days?: number;
  canCreate: boolean;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const overview = useQualityOverview(accountId, days);
  const action = useQualityAction<{ id: string; name: string }>(accountId);
  const weak = (overview.data?.weak ?? []).filter((w) => w.fails > 0).slice(0, compact ? 3 : 5);

  function create(criterionId: string, label: string) {
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

  // No Treino o cartão só aparece quando há o que treinar.
  if (compact && (overview.isPending || overview.isError || weak.length === 0)) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <TrendingDown className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-medium">O que mais derruba a nota</h3>
          <p className="text-[12px] text-muted-foreground">
            Últimos {days} dias. Transforme o ponto fraco em cenário de treino com roleplay.
          </p>
        </div>
      </div>
      {overview.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : overview.isError ? (
        <p className="text-[13px] text-danger">{errorMessage(overview.error)}</p>
      ) : weak.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-3 py-4 text-[13px] text-muted-foreground">
          Ainda não há critério reprovado. Quando as avaliações apontarem um ponto fraco, ele
          aparece aqui com o botão para treinar.
        </p>
      ) : (
        <ul className="space-y-3">
          {weak.map((w) => (
            <li key={w.criterion_id} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-medium">{w.label}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                  {w.fails} de {w.n} reprovadas
                </span>
                {canCreate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => create(w.criterion_id, w.label)}
                    disabled={action.isPending}
                    aria-label={`Criar cenário de treino para ${w.label}`}
                  >
                    {action.isPending && action.variables?.["criterionId"] === w.criterion_id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <GraduationCap />
                    )}
                    Treinar
                  </Button>
                )}
              </div>
              <ScoreBar value={w.avg} />
            </li>
          ))}
        </ul>
      )}
      {compact && (
        <Link
          to="/qualidade"
          className="mt-3 inline-block text-[12px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Ver a qualidade completa
        </Link>
      )}
    </section>
  );
}
