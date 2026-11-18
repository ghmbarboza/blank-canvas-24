import { Loader2 } from "lucide-react";

import { errorMessage } from "@/lib/functions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLlmUsage } from "./api";
import { SettingsCard } from "./SettingsCard";

const PURPOSE_LABEL: Record<string, string> = {
  lead_classification: "Classificar leads",
  reply_suggestion: "Sugerir respostas",
};

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function UsageCard({ accountId }: { accountId: string }) {
  const usage = useLlmUsage(accountId, true);
  const data = usage.data;
  const errorRate = data && data.total ? data.errors / data.total : 0;

  return (
    <SettingsCard
      title="Consumo de IA"
      description="Chamadas feitas à IA nos últimos 30 dias, por finalidade."
    >
      {usage.isLoading && (
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-label="Carregando consumo"
        />
      )}
      {usage.isError && <p className="text-[13px] text-danger">{errorMessage(usage.error)}</p>}
      {data && data.total === 0 && (
        <p className="text-[13px] text-muted-foreground">
          Nenhuma chamada nos últimos 30 dias. Elas aparecem aqui quando a IA começar a trabalhar.
        </p>
      )}
      {data && data.total > 0 && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-subtle uppercase">
                Chamadas
              </p>
              <p className="font-display text-3xl font-semibold tabular-nums">
                {formatNumber(data.total)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-subtle uppercase">
                Taxa de erro
              </p>
              <p
                className={cn(
                  "font-display text-3xl font-semibold tabular-nums",
                  errorRate > 0.05 ? "text-danger" : "text-foreground",
                )}
              >
                {pct(data.errors, data.total)}
              </p>
              <p className="text-[11px] text-subtle tabular-nums">
                {formatNumber(data.errors)} com falha
              </p>
            </div>
          </div>
          <table className="w-full text-[13px]">
            <caption className="sr-only">Chamadas por finalidade</caption>
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-subtle uppercase">
                <th className="py-2 font-semibold tracking-widest">Finalidade</th>
                <th className="py-2 text-right font-semibold tracking-widest">Chamadas</th>
                <th className="py-2 text-right font-semibold tracking-widest">Erros</th>
              </tr>
            </thead>
            <tbody>
              {data.byPurpose.map((row) => (
                <tr key={row.purpose} className="border-b border-border last:border-0">
                  <td className="py-2">{PURPOSE_LABEL[row.purpose] ?? row.purpose}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(row.calls)}</td>
                  <td
                    className={cn(
                      "py-2 text-right tabular-nums",
                      row.errors ? "text-danger" : "text-subtle",
                    )}
                  >
                    {formatNumber(row.errors)}{" "}
                    <span className="text-[11px]">({pct(row.errors, row.calls)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.sampled < data.total && (
            <p className="text-[11px] text-subtle">
              A divisão por finalidade considera as {formatNumber(data.sampled)} chamadas mais
              recentes; os totais acima contam todas.
            </p>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
