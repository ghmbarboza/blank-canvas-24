import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HeartPulse, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { formatMoney, formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { Kpi, LoadingGrid, Panel } from "@/features/reports/ui";

import { useCustomerHealth } from "../api";
import { LEVEL_LABEL, portfolio, scoreHealth, type HealthLevel } from "../health";
import { Chip } from "./IndicatorsTab";

const LEVEL_STYLE: Record<HealthLevel, string> = {
  healthy: "bg-surface-2 text-foreground",
  attention: "bg-[#C4CFDD] text-[#0A1F3B] dark:bg-[#5E7B9E] dark:text-white",
  risk: "bg-danger/10 text-danger",
};

// Saúde da carteira: nota de 0 a 100 com o motivo, risco de cancelamento e renovação.
export function CustomersTab({ accountId }: { accountId: string }) {
  const q = useCustomerHealth(accountId);
  const [filter, setFilter] = useState<"all" | HealthLevel>("all");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (q.data ?? [])
        .map((s) => ({ signals: s, result: scoreHealth(s) }))
        .sort((a, b) => a.result.score - b.result.score),
    [q.data],
  );
  const sum = useMemo(() => portfolio(rows), [rows]);
  const visible = filter === "all" ? rows : rows.filter((r) => r.result.level === filter);

  if (q.isPending) return <LoadingGrid />;
  if (q.isError)
    return (
      <p className="text-[13px] text-danger">Não deu para carregar: {errorMessage(q.error)}</p>
    );
  if (rows.length === 0)
    return (
      <EmptyState
        icon={HeartPulse}
        title="Nenhum cliente ativo ainda"
        description="Quando um negócio é ganho, o contato vira cliente e entra aqui com a nota de saúde. Você também pode marcar um contato como cliente na ficha dele."
        action={
          <Link
            to="/contatos"
            className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
          >
            Ir para contatos
          </Link>
        }
      />
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          dark
          icon={ShieldAlert}
          label="Em risco"
          value={formatNumber(sum.risk)}
          sub={`${formatMoney(sum.mrrAtRisk)} por mês em risco alto`}
        />
        <Kpi label="Atenção" value={formatNumber(sum.attention)} />
        <Kpi
          label="Saudáveis"
          value={formatNumber(sum.healthy)}
          sub={`de ${formatNumber(sum.total)} clientes`}
        />
        <Kpi label="Renovam em 45 dias" value={formatNumber(sum.renewing45d)} />
      </div>

      <Panel
        title="Carteira"
        hint="Começa em 100 e cada sinal ruim tira pontos. Toque no cliente para ver o porquê."
        aside={
          <div className="flex flex-wrap gap-1.5">
            {(["all", "risk", "attention", "healthy"] as const).map((f) => (
              <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "Todos" : LEVEL_LABEL[f]}
              </Chip>
            ))}
          </div>
        }
      >
        <ul className="divide-y divide-border">
          {visible.slice(0, 200).map(({ signals: s, result: r }) => (
            <li key={s.contact_id}>
              <button
                type="button"
                className="row-wash flex w-full items-center gap-3 px-2 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setOpen(open === s.contact_id ? null : s.contact_id)}
                aria-expanded={open === s.contact_id}
              >
                <span className="w-10 font-display text-[18px] font-semibold tabular-nums">
                  {r.score}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {s.name ?? "Sem nome"}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {[
                      s.company_name,
                      r.renewal.label,
                      s.mrr > 0 ? `${formatMoney(s.mrr)}/mês` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    LEVEL_STYLE[r.level],
                  )}
                >
                  {LEVEL_LABEL[r.level]}
                </span>
              </button>
              {open === s.contact_id && (
                <div className="mb-3 ml-12 space-y-2 rounded-xl bg-surface-2 p-3 text-[13px]">
                  {r.factors.length === 0 ? (
                    <p className="text-muted-foreground">
                      Nenhum sinal ruim: conversa em dia, sem chamado aberto e pagamento em ordem.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {r.factors.map((f) => (
                        <li key={f.label} className="flex justify-between gap-3">
                          <span>{f.label}</span>
                          <span
                            className={cn(
                              "shrink-0 tabular-nums",
                              f.points < 0 ? "text-danger" : "text-foreground",
                            )}
                          >
                            {f.points > 0 ? "+" : ""}
                            {f.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="font-medium">Próximo passo: {r.nextAction}</p>
                  <p className="text-[12px] text-muted-foreground">
                    Risco de cancelamento: {r.churnRisk}
                  </p>
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: s.contact_id }}
                    className="inline-block text-[12px] font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Abrir a ficha
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
        {visible.length > 200 && (
          <p className="pt-3 text-[12px] text-subtle">Mostrando os 200 com nota mais baixa.</p>
        )}
      </Panel>
    </div>
  );
}
