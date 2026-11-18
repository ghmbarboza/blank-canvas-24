import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Target } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useGoalsProgress } from "@/features/commerce/api";
import { formatMoney } from "@/lib/format";

import { useForecastReport } from "./api";
import { pct } from "./lib";
import { countLabel } from "@/lib/plural";

// Cartão para o painel gerencial: o mês em uma frase (ganho, compromisso, meta do time e riscos).
export function DashboardForecastCard({ accountId }: { accountId: string }) {
  const forecast = useForecastReport(accountId, 1);
  const period = new Date();
  const goals = useGoalsProgress(
    accountId,
    `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, "0")}-01`,
  );
  if (forecast.isPending) return <Skeleton className="h-48 rounded-[24px]" />;
  const m = forecast.data?.months[0];
  const teamRevenue = goals.data?.find((g) => !g.user_id && g.metric === "revenue");
  const won = m?.won ?? 0;
  const commit = won + (m?.commit ?? 0);
  const risks = forecast.data?.risks.length ?? 0;

  return (
    <section
      className="lift rounded-[24px] border border-border bg-surface p-5"
      aria-label="Forecast do mês"
    >
      <header className="mb-3 flex items-center gap-2">
        <Target className="size-4 text-subtle" aria-hidden />
        <p className="eyebrow flex-1">Forecast do mês</p>
        <Link
          to="/relatorios"
          search={{ aba: "forecast" }}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Abrir <ArrowUpRight className="size-3" />
        </Link>
      </header>
      {commit > 0 ? (
        <>
          <p className="font-display text-[28px] leading-none font-semibold tabular-nums">
            {formatMoney(commit, true)}
          </p>
          <p className="mt-1 text-[13px] text-subtle">
            {formatMoney(won, true)} já ganho + {formatMoney(m?.commit ?? 0, true)} em compromisso ·
            ponderado {formatMoney(m?.weighted ?? 0, true)}
          </p>
        </>
      ) : (m?.weighted ?? 0) > 0 ? (
        <>
          <p className="font-display text-[28px] leading-none font-semibold tabular-nums">
            {formatMoney(m?.weighted ?? 0, true)}
          </p>
          <p className="mt-1 text-[13px] text-subtle">
            Previsão ponderada pelas etapas do funil. Nada ganho nem em compromisso neste mês ainda.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Sem negócio previsto para este mês. Crie negócios no Funil de vendas para a previsão
          aparecer aqui.
        </p>
      )}
      {teamRevenue && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[12px]">
            <span className="text-muted-foreground">Meta do time</span>
            <span className="tabular-nums">
              {pct(commit, teamRevenue.target)}% de {formatMoney(teamRevenue.target, true)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, pct(commit, teamRevenue.target))}%` }}
            />
          </div>
        </div>
      )}
      {risks > 0 && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          {countLabel(risks, "negócio")} com sinal de risco.
        </p>
      )}
    </section>
  );
}
