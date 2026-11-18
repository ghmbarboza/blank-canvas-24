import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Target } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamMembers } from "@/features/contacts/api";
import { monthRange, pct } from "@/features/reports/lib";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";
import { useAuth } from "@/lib/auth";

import {
  METRIC_LABEL,
  useCommissionRules,
  useCommissionTotals,
  useGoalsProgress,
  type CommissionTotals,
  type GoalProgress,
} from "./api";
import { CommissionHero } from "./CommissionHero";
import { CommissionRulesPanel } from "./CommissionRulesPanel";
import { CommissionsPanel } from "./CommissionsPanel";
import { GoalCard } from "./GoalCard";
import { GoalDialog } from "./GoalDialog";
import { TeamPerformance, type PerformanceRow } from "./TeamPerformance";

interface OwnerSales {
  user_id: string | null;
  name: string;
  won: number;
  won_value: number;
  lost: number;
  open_value: number;
}

function monthStart(offset: number): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function useSalesByOwner(accountId: string, range: { from: string; to: string }) {
  return useQuery({
    queryKey: ["report", accountId, "sales", range],
    queryFn: async (): Promise<OwnerSales[]> => {
      const { data, error } = await supabase.rpc("report_sales", {
        _account: accountId,
        _from: range.from,
        _to: range.to,
      });
      if (error) throw error;
      return (data as { by_owner?: OwnerSales[] }).by_owner ?? [];
    },
  });
}

// Junta vendas, meta de receita e comissão de cada pessoa numa linha só.
function buildPerformance(
  sales: OwnerSales[],
  goals: GoalProgress[],
  totals: CommissionTotals | undefined,
  names: Map<string, string>,
): PerformanceRow[] {
  const revenueGoal = new Map(
    goals.filter((g) => g.user_id && g.metric === "revenue").map((g) => [g.user_id!, g.target]),
  );
  const ids = new Set<string>([
    ...sales.flatMap((s) => (s.user_id ? [s.user_id] : [])),
    ...revenueGoal.keys(),
    ...(totals?.byUser.keys() ?? []),
  ]);
  return [...ids]
    .map((id) => {
      const s = sales.find((x) => x.user_id === id);
      const c = totals?.byUser.get(id);
      return {
        userId: id,
        name: names.get(id) ?? s?.name ?? "Vendedor",
        wonValue: Number(s?.won_value ?? 0),
        won: Number(s?.won ?? 0),
        goal: revenueGoal.get(id),
        commission: c?.total ?? 0,
        pending: c?.pending ?? 0,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.commission - a.commission);
}

// Metas e comissão: quanto o mês gerou, a regra em português e o desempenho de cada pessoa.
export function GoalsPage() {
  const { current, isManager } = useAccount();
  const { user } = useAuth();
  const accountId = current!.accountId;
  const [offset, setOffset] = useState(0);
  const month = monthStart(offset);
  const period = iso(month);
  const range = monthRange(month);
  const team = useTeamMembers(accountId);
  const members = useMemo(() => new Map((team.data ?? []).map((m) => [m.userId, m])), [team.data]);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const goals = useGoalsProgress(accountId, period);
  const sales = useSalesByOwner(accountId, range);
  const totals = useCommissionTotals(accountId, range);
  const rules = useCommissionRules(accountId);
  const [goalDialog, setGoalDialog] = useState(false);
  const label = month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const isCurrent = offset === 0;
  const goalList = goals.data ?? [];
  const teamGoals = goalList.filter((g) => !g.user_id);
  const userGoals = goalList
    .filter((g) => g.user_id)
    .sort((a, b) => pct(b.achieved, b.target) - pct(a.achieved, a.target));
  const performance = useMemo(
    () => buildPerformance(sales.data ?? [], goals.data ?? [], totals.data, names),
    [sales.data, goals.data, totals.data, names],
  );
  const wonValue = sales.data?.reduce((s, x) => s + Number(x.won_value), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Metas e comissão"
        description="Quanto o time fechou, em que ritmo está e quanto cada um tem a receber"
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setOffset((o) => o - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-28 text-center text-[13px] font-medium first-letter:uppercase sm:min-w-36">
              {label}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setOffset((o) => o + 1)}
            >
              <ChevronRight />
            </Button>
            {isManager && (
              <Button
                size="sm"
                className="ml-2 hidden sm:inline-flex"
                onClick={() => setGoalDialog(true)}
              >
                <Plus /> Definir meta
              </Button>
            )}
          </div>
        }
      />
      <div className="flex-1 space-y-8 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <CommissionHero
          totals={totals.data}
          isLoading={totals.isPending}
          wonValue={wonValue}
          rules={rules.data}
          names={names}
        />

        <Tabs defaultValue="desempenho">
          <TabsList className="mb-5">
            <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
            <TabsTrigger value="comissoes">Comissões</TabsTrigger>
            {isManager && <TabsTrigger value="regras">Regras de comissão</TabsTrigger>}
          </TabsList>

          <TabsContent value="desempenho" className="space-y-8">
            <section aria-labelledby="perf-title">
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-3">
                <h2 id="perf-title" className="font-display text-[17px] font-medium">
                  Desempenho da equipe
                </h2>
                <span className="hidden text-[12px] text-subtle sm:inline">
                  {performance.length} pessoa{performance.length === 1 ? "" : "s"} com venda, meta
                  ou comissão
                </span>
              </div>
              {sales.isPending || totals.isPending ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : (
                <TeamPerformance
                  rows={performance}
                  members={members}
                  currentUserId={user?.id}
                  isCurrentMonth={isCurrent}
                />
              )}
            </section>

            <section aria-labelledby="goals-title">
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-3">
                <h2 id="goals-title" className="font-display text-[17px] font-medium">
                  Metas do mês
                </h2>
                {isManager && (
                  <Button size="sm" variant="outline" onClick={() => setGoalDialog(true)}>
                    <Plus /> Definir meta
                  </Button>
                )}
              </div>
              {goals.isPending ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-40 rounded-xl" />
                  ))}
                </div>
              ) : goalList.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="Nenhuma meta neste mês"
                  className="py-10"
                  description={
                    isManager
                      ? "Defina a meta do time e de cada vendedor: receita, negócios, reuniões, ligações ou novos leads."
                      : "Seu gestor ainda não definiu metas para este mês."
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {teamGoals.map((g) => (
                    <GoalCard
                      key={g.goal_id}
                      g={g}
                      title={METRIC_LABEL[g.metric] ?? g.metric}
                      isCurrent={isCurrent}
                      canDelete={isManager}
                      accountId={accountId}
                      featured
                    />
                  ))}
                  {userGoals.map((g) => (
                    <GoalCard
                      key={g.goal_id}
                      g={g}
                      title={`${names.get(g.user_id!) ?? "Vendedor"}${g.user_id === user?.id ? " (você)" : ""}`}
                      subtitle={METRIC_LABEL[g.metric]}
                      isCurrent={isCurrent}
                      canDelete={isManager}
                      accountId={accountId}
                    />
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="comissoes">
            <CommissionsPanel
              accountId={accountId}
              range={range}
              names={names}
              isManager={isManager}
            />
          </TabsContent>
          {isManager && (
            <TabsContent value="regras">
              <CommissionRulesPanel accountId={accountId} names={names} />
            </TabsContent>
          )}
        </Tabs>
      </div>
      <GoalDialog
        accountId={accountId}
        period={period}
        open={goalDialog}
        onOpenChange={setGoalDialog}
        members={team.data ?? []}
      />
    </div>
  );
}
