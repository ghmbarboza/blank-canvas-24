import { SetupProgressCard } from "@/features/setup/SetupEntry";
import { ApprovalsPanel } from "@/features/agents/autopilot/ApprovalsPanel";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Eye, Plug } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";

import { AttentionCard } from "./AttentionCard";
import { ChannelsCard } from "./ChannelsCard";
import { demoGerencial } from "./demo";
import { FunnelCard } from "./FunnelCard";
import { isEmptyAccount, useGerencial, type Period } from "./gerencial";
import { Heatmap } from "./Heatmap";
import { Hero } from "./Hero";
import { AgendaCard, HotLeadsCard, TemperatureCard } from "./LeadsCards";
import { OriginCard } from "./OriginCard";
import { TeamCard } from "./TeamCard";
import { NowStrip } from "@/features/my-day/NowStrip";
import { useAccountId } from "@/lib/account";
import { DashboardForecastCard } from "@/features/reports/DashboardForecastCard";
import { SacMetricsStrip } from "@/features/support/SacMetricsStrip";
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

export function DashboardPage() {
  const { user } = useAuth();
  const accountId = useAccountId();
  const [days, setDays] = useState<Period>(30);
  const [demoChoice, setDemoChoice] = useState<boolean | null>(null);
  const { data: real, isLoading, isError, error, refetch } = useGerencial(days);

  const empty = isEmptyAccount(real);
  const demo = demoChoice ?? empty;
  const data = useMemo(() => (demo ? demoGerencial(days) : real), [demo, days, real]);

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

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-background">
      {isLoading || !data ? (
        <LoadingHero />
      ) : (
        <Hero data={data} days={days} onDays={setDays} userName={firstName(user)} />
      )}
      <div className="mx-auto max-w-[1440px] px-3 pt-4 md:px-5 [&:empty]:hidden">
        <NowStrip accountId={accountId} userId={user?.id ?? null} />
        <ApprovalsPanel accountId={accountId} where="painel" />
      </div>
      <div className="mx-3 mt-3 md:mx-5 md:mt-5 [&:empty]:hidden">
        <SetupProgressCard />
      </div>

      {(demo || empty) && (
        <div className="mx-auto max-w-[1440px] px-3 pt-4 md:px-5">
          <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Eye className="size-4" aria-hidden />
            </span>
            <p className="flex-1 text-[13px] text-muted-foreground">
              {demo ? (
                <>
                  <span className="font-semibold text-foreground">
                    Você está vendo um exemplo com dados fictícios.
                  </span>{" "}
                  Sua conta ainda não tem conversas. Conecte um canal e o painel passa a mostrar a
                  sua operação.
                </>
              ) : (
                <>
                  Sua conta ainda não tem movimento. Os blocos se preenchem com as primeiras
                  conversas.
                </>
              )}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setDemoChoice(!demo)}>
                {demo ? "Ver meus dados" : "Ver exemplo"}
              </Button>
              <Button asChild size="sm">
                <Link to="/canais">
                  <Plug /> Conectar canais
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[1440px] gap-4 px-3 py-5 md:px-5 lg:grid-cols-12">
        {data ? (
          <>
            <AttentionCard demo={demo} className="lg:col-span-7" />
            <FunnelCard stages={data.funnel} className="lg:col-span-5" />
            <OriginCard accountId={accountId} days={days} className="lg:col-span-7" />
            <ChannelsCard channels={data.channels} className="lg:col-span-5" />
            <VolumeChart daily={data.daily} className="lg:col-span-12" />
            <Heatmap cells={data.heatmap} className="lg:col-span-12" />
            <TeamCard team={data.team} className="lg:col-span-8" />
            <TemperatureCard data={data} className="lg:col-span-4" />
            <HotLeadsCard demo={demo} className="lg:col-span-7" />
            <AgendaCard demo={demo} className="lg:col-span-5" />
            <SacMetricsStrip accountId={accountId} days={days} className="lg:col-span-12" />
            <div className="lg:col-span-12">
              <DashboardForecastCard accountId={accountId} />
            </div>
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
