import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { useContactDeals } from "../api";
import { PanelSection } from "./PanelSection";

// Cartão principal do cliente na carteira. Fora da composição da Caixa de entrada: a etapa da
// jornada já aparece em OpportunityBlock.
export function MainDealCard({ accountId, contactId }: { accountId: string; contactId: string }) {
  const deals = useContactDeals(accountId, contactId);
  if (deals.isLoading) {
    return (
      <PanelSection title="Na carteira">
        <Skeleton className="h-24 w-full rounded-xl" />
      </PanelSection>
    );
  }
  const main = deals.data?.[0];
  if (!main) return null;
  const { deal, stages } = main;
  const open = stages.filter((s) => s.kind === "open");
  const idx = open.findIndex((s) => s.id === deal.stage_id);
  const stage = stages.find((s) => s.id === deal.stage_id);
  const pct = open.length ? Math.round((100 * (idx + 1)) / open.length) : 0;
  const more = (deals.data?.length ?? 1) - 1;

  return (
    <PanelSection title="Na carteira">
      <Link
        to="/crm"
        search={{ negocio: deal.id }}
        className="lift group block rounded-xl border border-border bg-surface p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{deal.title}</p>
          <ArrowUpRight
            className="size-3.5 shrink-0 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
        <p className="mt-1 font-display text-[26px] leading-none font-semibold tabular-nums">
          {formatMoney(deal.value)}
        </p>
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-label="Avanço na jornada"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 flex justify-between gap-2 text-[11px] text-subtle">
          <span className="tabular-nums">
            {idx >= 0 ? `Etapa ${idx + 1} de ${open.length}` : ""}
          </span>
          <span className="truncate font-medium text-foreground">
            {stage ? stage.name : "Etapa não encontrada"}
          </span>
        </p>
      </Link>
      {more > 0 && (
        <p className="mt-2 text-[12px] text-subtle">
          Mais {more} {more === 1 ? "cartão na carteira" : "cartões na carteira"}
        </p>
      )}
    </PanelSection>
  );
}
