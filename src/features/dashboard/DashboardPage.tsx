import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Plug, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { enabledModules } from "@/components/layout/modules";
import { ApprovalsPanel } from "@/features/agents/autopilot/ApprovalsPanel";
import { useHealthMap } from "@/features/contacts/customer-health";
import { portfolio } from "@/features/gestao/health";
import { NowStrip } from "@/features/my-day/NowStrip";
import { useRuleRows } from "@/features/posvenda/api";
import { SetupProgressCard } from "@/features/setup/SetupEntry";
import { useSacMetrics } from "@/features/support/api";
import { SacMetricsStrip } from "@/features/support/SacMetricsStrip";
import { useAccount, useAccountId } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";

import { AgendaCard } from "./AgendaCard";
import { AttentionCard } from "./AttentionCard";
import { ChannelsCard } from "./ChannelsCard";
import { isEmptyAccount, useGerencial, type Period } from "./gerencial";
import { Heatmap } from "./Heatmap";
import { Hero } from "./Hero";
import { JourneyCard } from "./JourneyCard";
import { rulesSummary } from "./overview";
import { PortfolioCard } from "./PortfolioCard";
import { RulesCard } from "./RulesCard";
import { TeamCard } from "./TeamCard";
import { VolumeChart } from "./VolumeChart";

function firstName(user: ReturnType<typeof useAuth>["user"]): string {
  const meta = user?.user_metadata as { full_name?: unknown; name?: unknown } | undefined;
  const full =
    typeof meta?.full_name === "string"
      ? meta.full_name
      : typeof meta?.name === "string"
        ? meta.name
        : "";
  const base = full.trim() || (user?.email ?? "").split("@")[0] || "";
  const first = base.split(/[\s._-]+/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "time";
}

// Painel de pós-venda. Ordem de leitura: como está a carteira e o atendimento (topo), o que fazer
// hoje, quem está em risco, o que roda sozinho (regras), satisfação e chamados, e por fim o volume.
// Cada número vem de uma consulta real; sem dado, o bloco diz o que falta e o próximo passo.
export function DashboardPage() {
  const { user } = useAuth();
  const accountId = useAccountId();
  const { current, isManager } = useAccount();
  const [days, setDays] = useState<Period>(30);
  const { data, isLoading, isError, error, refetch } = useGerencial(days);
  const health = useHealthMap(accountId);
  const sac = useSacMetrics(accountId, days);
  const ruleRows = useRuleRows(accountId);

  const healthRows = useMemo(() => [...health.map.values()], [health.map]);
  const rules = useMemo(() => rulesSummary(ruleRows.byRule), [ruleRows.byRule]);
  const canOpenHealth = isManager && enabledModules(current?.settings).has("gestao");

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar o painel"
          description={errorMessage(error)}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }

  const empty = isEmptyAccount(data) && !health.isPending && healthRows.length === 0;

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-background">
      {isLoading || !data ? (
        <LoadingHero />
      ) : (
        <Hero
          data={data}
          days={days}
          onDays={setDays}
          userName={firstName(user)}
          extras={{
            portfolio: health.isPending || health.isError ? null : portfolio(healthRows),
            sac: sac.data,
            rules: ruleRows.isPending || ruleRows.isError ? null : rules,
          }}
        />
      )}
      <div className="mx-auto max-w-[1440px] px-3 pt-4 md:px-5 [&:empty]:hidden">
        <NowStrip accountId={accountId} userId={user?.id ?? null} />
        <ApprovalsPanel accountId={accountId} where="painel" />
      </div>
      <div className="mx-3 mt-3 md:mx-5 md:mt-5 [&:empty]:hidden">
        <SetupProgressCard />
      </div>

      {empty && (
        <div className="mx-auto max-w-[1440px] px-3 pt-4 md:px-5">
          <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <p className="flex-1 text-[13px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                Sua central ainda não tem movimento.
              </span>{" "}
              Conecte o WhatsApp para as conversas chegarem e ligue as regras de pós-venda. Os
              blocos abaixo se preenchem com os seus números, sem dado de exemplo.
            </p>
            <div className="flex shrink-0 gap-2">
              {isManager && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/pos-venda">Ligar regras</Link>
                </Button>
              )}
              <Button asChild size="sm">
                <Link to="/canais">
                  <Plug /> Conectar WhatsApp
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[1440px] gap-4 px-3 py-5 md:px-5 lg:grid-cols-12">
        {data ? (
          <>
            <AttentionCard className="lg:col-span-7" />
            <PortfolioCard
              rows={healthRows}
              isPending={health.isPending}
              isError={health.isError}
              canOpenHealth={canOpenHealth}
              className="lg:col-span-5"
            />
            <JourneyCard stages={data.funnel} className="lg:col-span-7" />
            <RulesCard
              rules={rules}
              isPending={ruleRows.isPending}
              isError={ruleRows.isError}
              className="lg:col-span-5"
            />
            <section aria-labelledby="painel-sac" className="lg:col-span-12">
              <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h2 id="painel-sac" className="eyebrow">
                  Chamados e satisfação · últimos {days} dias
                </h2>
                <Link
                  to="/atendimento"
                  className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Abrir chamados
                </Link>
              </div>
              <SacMetricsStrip accountId={accountId} days={days} />
            </section>
            <VolumeChart daily={data.daily} className="lg:col-span-12" />
            <ChannelsCard channels={data.channels} className="lg:col-span-5" />
            <TeamCard team={data.team} className="lg:col-span-7" />
            <Heatmap cells={data.heatmap} className="lg:col-span-8" />
            <AgendaCard className="lg:col-span-4" />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl lg:col-span-6" />
          ))
        )}
      </div>
    </div>
  );
}

function LoadingHero() {
  return (
    <div className="mx-3 mt-3 rounded-[28px] bg-[#001F35] px-5 pt-10 pb-6 md:mx-5 md:mt-5 md:rounded-[36px] md:px-10">
      <div className="mx-auto max-w-[1400px] animate-pulse">
        <div className="h-3 w-40 rounded-full bg-white/15" />
        <div className="mt-4 h-10 w-80 rounded-xl bg-white/15" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-40 rounded-[20px] bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
