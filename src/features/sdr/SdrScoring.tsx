import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Clock, Crosshair, Target } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import type { LeadScoreModel, ScoredLead } from "./api";
import { bestHourHeat, HEAT_DAYS, HEAT_HOURS, topModelFactors } from "./insights";
import { BestHour, FactorList, PredictiveScore } from "./LeadScoreChip";
import { DOW_LABEL } from "./model";

const HOT_AT = 70;
const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function SectionTitle({
  icon: Icon,
  id,
  children,
  aside,
}: {
  icon: typeof Target;
  id: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="size-[18px] text-subtle" aria-hidden />
      <h2 id={id} className="flex-1 font-display text-[19px] font-medium">
        {children}
      </h2>
      {aside}
    </div>
  );
}

// Coluna da nota: média dos leads abertos, os fatores que mais pesam no modelo, o mapa de horário e a lista.
export function SdrScoring({
  model,
  modelPending,
  leads,
  leadsPending,
  leadsError,
  ownerName,
}: {
  model: LeadScoreModel | null | undefined;
  modelPending: boolean;
  leads: ScoredLead[];
  leadsPending: boolean;
  leadsError: unknown;
  ownerName: (userId: string | null) => string;
}) {
  const metrics = (model?.metrics ?? {}) as { accuracy?: number | null; reason?: string | null };
  const trained = Boolean(model && metrics.accuracy != null);
  const factors = useMemo(() => topModelFactors(model?.weights), [model?.weights]);
  const heat = useMemo(() => bestHourHeat(leads), [leads]);
  const scores = leads.map((l) => l.score ?? 0);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const hot = scores.filter((s) => s >= HOT_AT).length;

  return (
    <div className="grid content-start gap-10">
      <section aria-labelledby="sdr-factors">
        <SectionTitle icon={Target} id="sdr-factors">
          Como a nota é feita
        </SectionTitle>
        <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
          {modelPending || leadsPending ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : (
            <div className="grid gap-6 md:grid-cols-[auto_1fr] md:gap-8">
              <div className="md:border-r md:border-border md:pr-8">
                <p className="eyebrow">Nota média</p>
                <p className="mt-2 font-display text-6xl leading-none font-semibold tabular-nums">
                  {avg ?? "—"}
                  {avg !== null && (
                    <span className="ml-1 text-[20px] font-normal text-subtle">/100</span>
                  )}
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {leads.length
                    ? `${hot} de ${leads.length} leads quentes (${HOT_AT} ou mais)`
                    : "Nenhum lead aberto com nota"}
                </p>
              </div>
              <p className="self-center text-[15px] leading-relaxed text-muted-foreground">
                {trained ? (
                  <>
                    O modelo aprendeu com os{" "}
                    <span className="font-medium text-foreground">
                      {model?.samples} negócios fechados
                    </span>{" "}
                    da sua conta ({model?.positives} ganhos) e acerta{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {Math.round(metrics.accuracy ?? 0)}%
                    </span>{" "}
                    deles. A nota é refeita todo dia e mostra os 3 motivos que mais pesaram em cada
                    lead.
                  </>
                ) : (
                  (metrics.reason ??
                  "Ainda não treinado. O modelo aprende com os negócios ganhos e perdidos do funil: com 20 fechados (5 de cada), ele passa a dar nota aos leads abertos.")
                )}
              </p>
            </div>
          )}
          {factors.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <p className="eyebrow">Os 3 fatores que mais pesam</p>
              <ul className="mt-4 space-y-4">
                {factors.map((f, i) => (
                  <li key={f.key}>
                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {f.direction === "up" ? (
                          <ArrowUp
                            className="size-3.5 shrink-0 text-foreground"
                            aria-label="aumenta a nota"
                          />
                        ) : (
                          <ArrowDown
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-label="diminui a nota"
                          />
                        )}
                        <span className="truncate font-medium">{f.label}</span>
                      </span>
                      <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                        {f.share}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          i === 0 ? "bg-primary" : i === 1 ? "bg-primary/75" : "bg-primary/50",
                        )}
                        style={{ width: `${f.share}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="sdr-heat">
        <SectionTitle
          icon={Clock}
          id="sdr-heat"
          aside={
            heat.total > 0 && (
              <span className="text-[12px] text-subtle">{heat.total} leads com horário</span>
            )
          }
        >
          Melhor horário para contato
        </SectionTitle>
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-[13px] text-muted-foreground">
            {heat.peak
              ? `Quando cada lead costuma responder. O pico é ${DOW_LABEL[heat.peak.dow]} às ${String(heat.peak.hour).padStart(2, "0")}h.`
              : "Ainda sem horário: ele aparece quando os leads respondem mensagens em horas diferentes."}
          </p>
          {heat.total > 0 && <Heat cells={heat.cells} max={heat.max} />}
        </div>
      </section>

      <section aria-labelledby="sdr-leads">
        <SectionTitle icon={Crosshair} id="sdr-leads">
          Leads com mais chance
        </SectionTitle>
        {leadsPending ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : leadsError ? (
          <p className="text-[13px] text-danger">{errorMessage(leadsError)}</p>
        ) : leads.length === 0 ? (
          <EmptyState
            icon={Crosshair}
            title="Nenhum lead com nota ainda"
            description="Marque os negócios como ganhos ou perdidos no funil. Com 20 fechados (5 de cada), o modelo aprende e dá nota aos leads abertos."
            className="rounded-xl border border-border bg-surface"
          />
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-surface">
            {leads.map((l) => (
              <li
                key={l.contact_id}
                className="row-wash border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <PredictiveScore score={l.score ?? 0} />
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: l.contact_id }}
                    className="min-w-0 flex-1 truncate rounded text-[14px] font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {l.contact?.name ?? l.contact?.email ?? "Sem nome"}
                  </Link>
                  <span className="text-[12px] text-muted-foreground">
                    {ownerName(l.contact?.owner_user_id ?? null)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-1">
                  <FactorList factors={l.factors} />
                  <BestHour hour={l.best_hour} dow={l.best_dow} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Heat({ cells, max }: { cells: number[][]; max: number }) {
  return (
    <div className="mt-5">
      <table className="w-full table-fixed border-separate border-spacing-[3px] text-[10px] sm:text-[11px]">
        <caption className="sr-only">Quantos leads respondem melhor em cada dia e hora</caption>
        <thead>
          <tr>
            <th scope="col" className="w-8" />
            {HEAT_HOURS.map((h) => (
              <th key={h} scope="col" className="font-normal text-subtle tabular-nums">
                {h}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HEAT_DAYS.map((d, di) => (
            <tr key={d}>
              <th scope="row" className="pr-1 text-left font-normal text-subtle">
                {DAY_SHORT[d]}
              </th>
              {HEAT_HOURS.map((h, hi) => {
                const n = cells[di]?.[hi] ?? 0;
                const t = max ? n / max : 0;
                return (
                  <td
                    key={h}
                    title={`${DOW_LABEL[d]}, ${h}h: ${n} ${n === 1 ? "lead" : "leads"}`}
                    className={cn("h-6 rounded-[4px]", n === 0 && "bg-surface-2")}
                    style={
                      n
                        ? {
                            backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(18 + t * 82)}%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <span className="sr-only">{n}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
