import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account";
import { useAuth } from "@/lib/auth";

import { MY_DAY_ERROR, useMyDay } from "./api";
import { DayTimeline } from "./DayTimeline";
import { HotLeadsSection, StaleDealsPanel, TaskPanel } from "./DayLists";
import { formatToday, greeting, wallHour } from "./format";
import { GoalRing } from "./GoalRing";
import { NowStrip } from "./NowStrip";

const TICK_MS = 60_000;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

// "Meu dia": a agenda, o que fazer e quem responder, numa leitura só.
export function MyDayPage() {
  const { current } = useAccount();
  const { user } = useAuth();
  const accountId = current!.accountId;
  const tz = current!.timezone || "America/Sao_Paulo";
  const day = useMyDay(accountId);
  const now = useNow();
  const userId = user?.id ?? null;
  const name =
    (user?.user_metadata?.["full_name"] as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0];
  const d = day.data;
  const eventCount = d?.events.length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8 md:py-12">
        <div className="mb-12 flex flex-col justify-between gap-6 border-b border-border pb-8 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Início · {formatToday(now, tz)}
            </p>
            <h1 className="mt-2 font-display text-[30px] leading-[1.1] font-medium tracking-[-0.02em] sm:text-[36px]">
              {greeting(wallHour(now, tz))}
              {name ? `, ${name}` : ""}.
              <span className="block font-normal text-subtle">O que temos para hoje.</span>
            </h1>
          </div>
          <GoalRing accountId={accountId} userId={userId} />
        </div>

        <NowStrip accountId={accountId} userId={userId} />

        {day.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-6">
            <AlertTriangle className="size-5 text-danger" aria-hidden />
            <p className="text-[14px] font-medium">Não foi possível montar o seu dia.</p>
            <p className="text-[13px] text-muted-foreground">{friendlyError(day.error)}</p>
            <Button variant="outline" size="sm" onClick={() => void day.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
            <div className="min-w-0 space-y-14">
              <section aria-labelledby="meu-dia-agenda">
                <div className="mb-7 flex items-center justify-between gap-3">
                  <h2 id="meu-dia-agenda" className="font-display text-[22px] font-medium">
                    Sua agenda
                  </h2>
                  {eventCount !== undefined && (
                    <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                      {eventCount} compromisso{eventCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {d ? (
                  <DayTimeline events={d.events} now={now} tz={tz} />
                ) : (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-2/3 rounded-xl" />
                    <Skeleton className="h-28 w-full rounded-xl" />
                  </div>
                )}
              </section>
              <hr className="border-border" />
              <HotLeadsSection accountId={accountId} leads={d?.hot_unanswered} />
            </div>

            <aside className="min-w-0 space-y-10" aria-label="Pendências do dia">
              <TaskPanel accountId={accountId} tasks={d?.tasks} tz={tz} />
              <StaleDealsPanel
                accountId={accountId}
                userId={userId}
                deals={d?.stale_deals}
                now={now}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

const FRIENDLY: readonly string[] = Object.values(MY_DAY_ERROR);

/** Só mostra texto escrito para o usuário; qualquer outro erro vira o aviso genérico. */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  return FRIENDLY.includes(msg) ? msg : MY_DAY_ERROR.unreachable;
}
