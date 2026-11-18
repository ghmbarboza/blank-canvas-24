import { hasChannel } from "@/lib/edition";
import { useState } from "react";

import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useIndicators, type IndicatorRow } from "./api";
import { formatSeconds } from "./lib";

const CHANNEL_NAME: Record<string, string> = {
  ...PLATFORM_LABEL,
  email: "E-mail",
  ticket: "Chamado",
  call: "Ligação",
  voice: "Ligação",
  callback: "Retorno de ligação",
  chat: "Chat",
};

const PERIODS = [
  { days: 1, label: "24 h" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
];

function p(v: number | null | undefined) {
  return v === null || v === undefined ? "–" : `${v}%`;
}

function Row({ name, r, occupancy }: { name: string; r: IndicatorRow; occupancy?: boolean }) {
  return (
    <tr className="row-wash border-t border-border">
      <th scope="row" className="py-2 pr-3 text-left font-medium">
        {name}
      </th>
      <td className="px-2 text-right tabular-nums">{r.offered}</td>
      <td className="px-2 text-right tabular-nums">{r.answered}</td>
      <td className="px-2 text-right tabular-nums">{formatSeconds(r.tme_seconds)}</td>
      <td className="px-2 text-right tabular-nums">{formatSeconds(r.tma_seconds)}</td>
      <td className="px-2 text-right tabular-nums">{p(r.fcr_pct)}</td>
      <td className="px-2 text-right tabular-nums">{p(r.abandon_pct)}</td>
      <td className="px-2 text-right tabular-nums">{p(r.sla_met_pct)}</td>
      {occupancy && <td className="px-2 text-right tabular-nums">{p(r.occupancy_pct)}</td>}
    </tr>
  );
}

function Head({ first, occupancy }: { first: string; occupancy?: boolean }) {
  return (
    <thead>
      <tr className="text-[11px] text-subtle">
        <th scope="col" className="pb-2 text-left font-medium">
          {first}
        </th>
        <th scope="col" className="px-2 text-right font-medium">
          Entraram
        </th>
        <th scope="col" className="px-2 text-right font-medium">
          Atendidos
        </th>
        <th scope="col" className="px-2 text-right font-medium" title="Tempo médio de espera">
          TME
        </th>
        <th
          scope="col"
          className="px-2 text-right font-medium"
          title="Tempo médio de atendimento, com pós-atendimento"
        >
          TMA
        </th>
        <th
          scope="col"
          className="px-2 text-right font-medium"
          title="Resolvido no primeiro contato: sem novo contato do cliente em 7 dias"
        >
          FCR
        </th>
        <th scope="col" className="px-2 text-right font-medium">
          Abandono
        </th>
        <th scope="col" className="px-2 text-right font-medium">
          No prazo
        </th>
        {occupancy && (
          <th
            scope="col"
            className="px-2 text-right font-medium"
            title="Tempo atendendo / tempo disponível"
          >
            Ocupação
          </th>
        )}
      </tr>
    </thead>
  );
}

/** Indicadores clássicos por fila, atendente e agente de IA. */
export function IndicatorsSection({ accountId }: { accountId: string }) {
  const [days, setDays] = useState(7);
  const q = useIndicators(accountId, days);
  return (
    <section aria-labelledby="indicadores" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="indicadores" className="font-display text-[18px] font-medium">
          Indicadores
        </h2>
        <div
          role="tablist"
          aria-label="Período"
          className="flex gap-1 rounded-full bg-surface-2 p-1"
        >
          {PERIODS.map((x) => (
            <button
              key={x.days}
              role="tab"
              type="button"
              aria-selected={days === x.days}
              onClick={() => setDays(x.days)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                days === x.days
                  ? "bg-surface text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : q.isError ? (
        <p className="text-[13px] text-danger">{errorMessage(q.error)}</p>
      ) : !q.data?.total || q.data.total.offered === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-[13px] text-muted-foreground">
          Ainda não há atendimentos no período. Os números aparecem assim que a primeira conversa ou
          chamado passar pela fila.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4 text-[13px]">
            <table className="w-full min-w-[640px]">
              <Head first="Fila" />
              <tbody>
                <Row name="Todas" r={q.data.total} />
                {q.data.by_queue.map((r) => (
                  <Row key={r.queue_id ?? "none"} name={r.name} r={r} />
                ))}
              </tbody>
            </table>
          </div>
          {(q.data.by_channel?.length ?? 0) > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4 text-[13px]">
              <table className="w-full min-w-[640px]">
                <Head first="Canal" />
                <tbody>
                  {q.data.by_channel!.map((r) => (
                    <Row key={r.channel} name={CHANNEL_NAME[r.channel] ?? r.channel} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data.by_agent.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4 text-[13px]">
              <table className="w-full min-w-[700px]">
                <Head first="Atendente" occupancy />
                <tbody>
                  {q.data.by_agent.map((r) => (
                    <Row key={r.assigned_user_id} name={r.name} r={r} occupancy />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasChannel("phone") && q.data.by_ai_agent.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface p-4 text-[13px]">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="text-[11px] text-subtle">
                    <th scope="col" className="pb-2 text-left font-medium">
                      Agente de IA (voz)
                    </th>
                    <th scope="col" className="px-2 text-right font-medium">
                      Ligações
                    </th>
                    <th scope="col" className="px-2 text-right font-medium">
                      Atendidas
                    </th>
                    <th scope="col" className="px-2 text-right font-medium">
                      TMA
                    </th>
                    <th scope="col" className="px-2 text-right font-medium">
                      Passou para gente
                    </th>
                    <th scope="col" className="px-2 text-right font-medium">
                      Resolveu sozinho
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.by_ai_agent.map((a) => (
                    <tr key={a.voice_agent_id} className="row-wash border-t border-border">
                      <th scope="row" className="py-2 pr-3 text-left font-medium">
                        {a.name}
                      </th>
                      <td className="px-2 text-right tabular-nums">{a.calls}</td>
                      <td className="px-2 text-right tabular-nums">{a.answered}</td>
                      <td className="px-2 text-right tabular-nums">
                        {formatSeconds(a.tma_seconds)}
                      </td>
                      <td className="px-2 text-right tabular-nums">{a.transferred}</td>
                      <td className="px-2 text-right tabular-nums">{p(a.resolution_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
