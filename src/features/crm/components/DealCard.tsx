import { forwardRef, type HTMLAttributes } from "react";
import { differenceInCalendarDays } from "date-fns";
import { AlertCircle } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OwnerAvatar } from "@/features/contacts/components/OwnerAvatar";
import { ContactMomentBadge } from "@/features/posvenda/moment-ui";
import type { TeamMember } from "@/features/contacts/types";

import type { BoardDeal } from "../types";

const STALE_DAYS = 7;

function daysInStage(updatedAt: string): number {
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(updatedAt)));
}

function daysLabel(days: number): string {
  if (days === 0) return "hoje";
  return days === 1 ? "1 dia" : `${days} dias`;
}

type Props = HTMLAttributes<HTMLDivElement> & {
  deal: BoardDeal;
  owner: TeamMember | undefined;
  dragging?: boolean;
  overlay?: boolean;
};

// Cartão do cliente na carteira. Apresentação pura: arrastar e abrir ficam com quem o envolve.
export const DealCard = forwardRef<HTMLDivElement, Props>(function DealCard(
  { deal, owner, dragging = false, overlay = false, className, ...rest },
  ref,
) {
  const days = daysInStage(deal.updated_at);
  const stale = deal.status === "open" && days > STALE_DAYS;
  const source = deal.contact?.source ?? deal.source;
  const platform = source && PLATFORM_LABEL[source] ? source : null;

  const kicker = deal.companyName ?? deal.contact?.name ?? null;
  const overdue = deal.nextStep ? new Date(deal.nextStep.dueAt).getTime() < Date.now() : false;

  return (
    <div
      ref={ref}
      className={cn(
        "group relative rounded-xl border border-border bg-surface p-4 text-left outline-none",
        !overlay && !dragging && "lift",
        "hover:border-border-strong",
        "focus-visible:ring-2 focus-visible:ring-ring",
        dragging && "opacity-40",
        overlay && "rotate-[1.5deg] cursor-grabbing border-primary-line shadow-drag",
        !overlay && "cursor-grab active:cursor-grabbing",
        className,
      )}
      {...rest}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {platform && <ChannelIcon platform={platform} size={12} className="shrink-0" />}
          <span className="truncate">{kicker ?? "Sem empresa"}</span>
        </span>
        {deal.status === "open" && (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-[11px] tabular-nums",
              stale ? "font-medium text-danger" : "text-subtle",
            )}
            title={stale ? `Parado há mais de ${STALE_DAYS} dias nesta etapa` : "Tempo nesta etapa"}
          >
            {stale && <AlertCircle className="size-3" aria-hidden />}
            {daysLabel(days)}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-[15px] leading-snug font-semibold text-foreground">
        {deal.title}
      </p>
      {Number(deal.value) > 0 && (
        <p className="mt-0.5 text-[14px] tabular-nums" title="Valor do contrato">
          {formatMoney(deal.value)}
        </p>
      )}

      {deal.status !== "lost" && (
        <ContactMomentBadge contactId={deal.contact_id} className="mt-2 flex" />
      )}

      {deal.nextStep && deal.status === "open" && (
        <p
          className={cn(
            "mt-2.5 inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium",
            overdue ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted-foreground",
          )}
          title={`Próximo passo${overdue ? " (atrasado)" : ""}: ${deal.nextStep.title}`}
        >
          <span className="truncate">{deal.nextStep.title}</span>
        </p>
      )}

      {deal.status === "lost" && deal.lost_reason && (
        <p className="mt-2.5 line-clamp-2 rounded-md bg-surface-2 px-2 py-1 text-[12px] text-muted-foreground">
          {deal.lost_reason}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="truncate text-[12px] text-muted-foreground">
          {owner?.name ?? "Sem responsável"}
        </span>
        <OwnerAvatar member={owner} size={24} />
      </div>
    </div>
  );
});
