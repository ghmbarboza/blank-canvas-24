import { useMemo, useState, type ReactNode } from "react";
import { useSearch } from "@tanstack/react-router";
import { KanbanSquare, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount, useAccountId } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { useTeamMembers } from "@/features/contacts/api";
import { useForecastReport } from "@/features/reports/api";

import { useBoardDeals, useDealsRealtime, useMoveDeal, usePipelines, useStages } from "../api";
import { POSITION_GAP } from "../position";
import { DEFAULT_DEAL_FILTERS, type BoardDeal, type DealFilters } from "../types";
import { CrmToolbar, type ForecastState } from "./CrmToolbar";
import { DealSheet } from "./DealSheet";
import { KanbanBoard } from "./KanbanBoard";
import { NewDealDialog } from "./NewDealDialog";
import { NewPipelineDialog } from "./NewPipelineDialog";
import { PipelineSettingsDialog } from "./PipelineSettingsDialog";
import { SummaryStrip } from "./SummaryStrip";

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function applyFilters(deals: BoardDeal[], f: DealFilters, userId: string | null): BoardDeal[] {
  const term = normalize(f.search.trim());
  return deals.filter((d) => {
    if (f.owner === "mine" && d.owner_user_id !== userId) return false;
    if (f.temperature !== "all" && d.contact?.temperature !== f.temperature) return false;
    if (term && !normalize(d.title).includes(term) && !normalize(d.contact?.name).includes(term))
      return false;
    return true;
  });
}

export function CrmPage() {
  const accountId = useAccountId();
  const { isManager } = useAccount();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const pipelines = usePipelines(accountId);
  const [selected, setSelected] = useState<string | null>(null);
  const list = pipelines.data ?? [];
  const pipelineId = selected ?? list.find((p) => p.is_default)?.id ?? list[0]?.id ?? null;
  const pipeline = list.find((p) => p.id === pipelineId);

  const stages = useStages(accountId, pipelineId);
  const deals = useBoardDeals(accountId, pipelineId);
  const team = useTeamMembers(accountId);
  const move = useMoveDeal(accountId, pipelineId ?? "");
  useDealsRealtime(accountId);
  const forecastReport = useForecastReport(accountId, 1);
  const thisMonth = forecastReport.data?.months[0];
  const forecast: ForecastState = forecastReport.isPending
    ? { status: "loading" }
    : forecastReport.isError
      ? { status: "error" }
      : { status: "ready", won: thisMonth?.won ?? 0, commit: thisMonth?.commit ?? 0 };

  const [filters, setFilters] = useState<DealFilters>(DEFAULT_DEAL_FILTERS);
  // ?negocio=<id> abre o negócio direto (links do "Meu dia", notificações e relatórios).
  const search = useSearch({ strict: false }) as { negocio?: string };
  const [openDealId, setOpenDealId] = useState<string | null>(search.negocio ?? null);
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [creatingPipeline, setCreatingPipeline] = useState(false);

  const allDeals = useMemo(() => deals.data ?? [], [deals.data]);
  const visible = useMemo(
    () => applyFilters(allDeals, filters, userId),
    [allDeals, filters, userId],
  );
  const members = team.data ?? [];
  const memberMap = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m])),
    [team.data],
  );
  const stageList = stages.data ?? [];
  const hasFilters =
    filters.owner !== "all" || filters.temperature !== "all" || Boolean(filters.search.trim());

  const topPosition = (stageId: string) => {
    const inStage = allDeals.filter((d) => d.stage_id === stageId).map((d) => d.position);
    return inStage.length ? Math.min(...inStage) - POSITION_GAP : POSITION_GAP;
  };
  const dealCount = (stageId: string) => allDeals.filter((d) => d.stage_id === stageId).length;

  const onMove: Parameters<typeof KanbanBoard>[0]["onMove"] = ({
    deal,
    stage,
    position,
    lostReason,
  }) =>
    move.mutateAsync({ dealId: deal.id, stage, position, lostReason }).catch((err: unknown) => {
      toast.error(`Não deu para mover “${deal.title}”: ${errorMessage(err)}`);
    });

  const loading =
    pipelines.isPending || (Boolean(pipelineId) && (stages.isPending || deals.isPending));
  const error = pipelines.error ?? stages.error ?? deals.error;

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex gap-4 overflow-hidden p-6" aria-busy aria-label="Carregando funil">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-[288px] shrink-0 space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <EmptyState
        icon={SearchX}
        title="Não deu para carregar o funil"
        description={errorMessage(error)}
        action={
          <Button
            onClick={() =>
              void Promise.all([pipelines.refetch(), stages.refetch(), deals.refetch()])
            }
          >
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (!pipelineId) {
    body = (
      <EmptyState
        icon={KanbanSquare}
        title="Nenhum funil criado"
        description={
          isManager
            ? "Crie o primeiro funil para organizar seus negócios."
            : "Peça a um gestor para criar o funil da equipe."
        }
        action={
          isManager ? (
            <Button onClick={() => setCreatingPipeline(true)}>Criar funil</Button>
          ) : undefined
        }
      />
    );
  } else if (allDeals.length === 0) {
    body = (
      <EmptyState
        icon={KanbanSquare}
        title="Nenhum negócio ainda"
        description="Quando a IA classificar um lead como quente, ele aparece aqui sozinho. Você também pode abrir um negócio agora."
        action={
          <Button onClick={() => setCreatingDeal(true)}>
            <Plus aria-hidden /> Novo negócio
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {hasFilters && visible.length === 0 && (
          <p className="px-6 pt-4 text-[13px] text-muted-foreground" role="status">
            Nenhum negócio neste filtro.{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setFilters(DEFAULT_DEAL_FILTERS)}
            >
              Limpar filtros
            </button>
          </p>
        )}
        <KanbanBoard
          stages={stageList}
          deals={visible}
          members={memberMap}
          onOpenDeal={setOpenDealId}
          onMove={onMove}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CrmToolbar
        pipelines={list}
        pipelineId={pipelineId}
        onPipelineChange={(id) => {
          setSelected(id);
          setOpenDealId(null);
        }}
        filters={filters}
        onFiltersChange={setFilters}
        isManager={isManager}
        onConfigure={() => setConfiguring(true)}
        onNewPipeline={() => setCreatingPipeline(true)}
        onNewDeal={() => setCreatingDeal(true)}
        canCreateDeal={stageList.length > 0}
        forecast={forecast}
      />
      {pipelineId && !loading && !error && <SummaryStrip deals={visible} stages={stageList} />}
      {body}

      <DealSheet
        accountId={accountId}
        deal={openDealId ? allDeals.find((d) => d.id === openDealId) : undefined}
        stages={stageList}
        members={members}
        memberMap={memberMap}
        onClose={() => setOpenDealId(null)}
      />
      {pipelineId && (
        <NewDealDialog
          accountId={accountId}
          pipelineId={pipelineId}
          stages={stageList}
          open={creatingDeal}
          onOpenChange={setCreatingDeal}
          topPosition={topPosition}
          onCreated={setOpenDealId}
        />
      )}
      {pipelineId && isManager && (
        <PipelineSettingsDialog
          accountId={accountId}
          pipelineId={pipelineId}
          pipelineName={pipeline?.name ?? ""}
          stages={stageList}
          dealCount={dealCount}
          open={configuring}
          onOpenChange={setConfiguring}
        />
      )}
      {isManager && (
        <NewPipelineDialog
          accountId={accountId}
          nextPosition={list.reduce((max, p) => Math.max(max, p.position), -1) + 1}
          open={creatingPipeline}
          onOpenChange={setCreatingPipeline}
          onCreated={setSelected}
        />
      )}
    </div>
  );
}
