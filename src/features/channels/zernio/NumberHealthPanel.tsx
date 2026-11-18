import { AlertTriangle, Gauge } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";
import { formatPhone } from "@/lib/format";
import { formatDuration } from "@/features/telephony/lib";
import { cn } from "@/lib/utils";

import { useNumberHealth } from "../zernio-api";
import type { HealthLevel } from "../zernio-rules";

const LEVEL: Record<HealthLevel, { label: string; cls: string }> = {
  ok: { label: "Saudável", cls: "bg-surface-2 text-muted-foreground" },
  attention: { label: "Atenção", cls: "bg-warm-soft text-warm-fg" },
  risk: { label: "Risco de bloqueio", cls: "bg-hot-soft text-hot-fg" },
};

/** Por número de saída: ligações por hora, taxa de atendimento e duração média (últimas 24 h). */
export function NumberHealthPanel({ accountId }: { accountId: string }) {
  const health = useNumberHealth(accountId);
  const rows = health.data ?? [];
  const risky = rows.filter((r) => r.verdict.level === "risk");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-[14px] font-medium">Saúde dos números de saída</h3>
        <span className="text-[12px] text-subtle">últimas 24 h · todas as ligações feitas</span>
      </div>
      {risky.length > 0 && (
        <div
          className="flex gap-2 rounded-lg border border-hot-line bg-hot-soft p-3 text-[13px] text-hot-fg"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {risky.length === 1 ? "Um número está" : `${risky.length} números estão`} perto de ser
            bloqueado pela operadora. Diminua o ritmo ou reveze com outro número. Os gestores foram
            avisados.
          </p>
        </div>
      )}
      {health.isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : health.isError ? (
        <p className="text-[13px] text-danger">{errorMessage(health.error)}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-[13px] text-muted-foreground">
          Nenhuma ligação feita nas últimas 24 h. Quando a equipe ou a IA ligar, a saúde de cada
          número aparece aqui.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((r) => {
            const lv = LEVEL[r.verdict.level];
            const rate =
              r.verdict.answerRate === null ? "—" : `${Math.round(r.verdict.answerRate * 100)}%`;
            return (
              <li key={r.number} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium tabular-nums">{formatPhone(r.number)}</p>
                  {r.verdict.reasons.length > 0 && (
                    <p className="text-[12px] text-muted-foreground">
                      {r.verdict.reasons.join(" · ")}
                    </p>
                  )}
                </div>
                <dl className="grid grid-cols-4 gap-3 text-[12px] tabular-nums sm:w-[22rem]">
                  <div>
                    <dt className="text-subtle">Última hora</dt>
                    <dd className="font-medium">{r.calls_last_hour}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Ligações</dt>
                    <dd className="font-medium">{r.calls_total}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Atendem</dt>
                    <dd className="font-medium">{rate}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Média</dt>
                    <dd className="font-medium">
                      {r.avg_duration_seconds === null
                        ? "—"
                        : formatDuration(r.avg_duration_seconds)}
                    </dd>
                  </div>
                </dl>
                <span
                  className={cn(
                    "self-start rounded-full px-2 py-0.5 text-[11px] font-medium sm:self-center",
                    lv.cls,
                  )}
                >
                  {lv.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
