import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronsLeftRight, ChevronsRightLeft } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/features/contacts/types";

import { stageBarClass } from "../stageColors";
import type { BoardDeal, Stage } from "../types";
import { DealCard } from "./DealCard";

function SortableDeal({
  deal,
  owner,
  onOpen,
}: {
  deal: BoardDeal;
  owner: TeamMember | undefined;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });
  return (
    <DealCard
      ref={setNodeRef}
      deal={deal}
      owner={owner}
      dragging={isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={`${deal.title}, ${formatMoney(deal.value)}. Enter abre, espaço arrasta.`}
      onClick={() => onOpen(deal.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(deal.id);
        else listeners?.["onKeyDown"]?.(e);
      }}
    />
  );
}

type Props = {
  stage: Stage;
  deals: BoardDeal[];
  members: Map<string, TeamMember>;
  onOpen: (id: string) => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (() => void) | undefined;
};

export function KanbanColumn({
  stage,
  deals,
  members,
  onOpen,
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, d) => sum + Number(d.value), 0);
  const headingId = `stage-${stage.id}`;

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-labelledby={headingId}
        className={cn(
          "flex w-12 shrink-0 flex-col items-center gap-3 rounded-xl border border-dashed border-border py-3 transition-colors",
          isOver && "border-primary-line bg-primary-soft",
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Expandir ${stage.name}`}
        >
          <ChevronsLeftRight className="size-4" aria-hidden />
        </button>
        <span className={cn("h-6 w-1 rounded-full", stageBarClass(stage.color))} aria-hidden />
        <h3 id={headingId} className="text-[13px] font-medium [writing-mode:vertical-rl]">
          {stage.name}
        </h3>
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
          {deals.length}
        </span>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex max-h-full w-[288px] shrink-0 snap-start flex-col"
    >
      <header className="mb-3 px-1">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3
            id={headingId}
            className="flex min-w-0 items-center gap-2 text-[15px] font-medium tracking-tight"
          >
            <span className="truncate">{stage.name}</span>
            <span
              className="rounded-full bg-surface-3 px-2 py-[2px] text-[11px] font-medium text-muted-foreground tabular-nums"
              aria-label={`${deals.length} cliente${deals.length === 1 ? "" : "s"}`}
            >
              {deals.length}
            </span>
          </h3>
          <span className="flex items-center gap-1">
            <span
              className="text-[13px] font-medium text-muted-foreground tabular-nums"
              title={`Valor em contratos em ${stage.name}: ${formatMoney(total)}`}
            >
              {formatMoney(total, total >= 1_000_000)}
            </span>
            {collapsible && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Recolher ${stage.name}`}
              >
                <ChevronsRightLeft className="size-3.5" aria-hidden />
              </button>
            )}
          </span>
        </div>
        <div
          className="h-[2px] w-full overflow-hidden rounded-full bg-border"
          role="meter"
          aria-valuenow={stage.probability}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Chance de continuar cliente ${stage.probability}%`}
        >
          <div
            className={cn("h-full", stageBarClass(stage.color))}
            style={{ width: `${stage.probability}%` }}
          />
        </div>
      </header>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto rounded-xl p-1 pb-8 transition-colors",
            isOver && "bg-primary-soft/60",
          )}
        >
          {deals.map((d) => (
            <SortableDeal
              key={d.id}
              deal={d}
              owner={d.owner_user_id ? members.get(d.owner_user_id) : undefined}
              onOpen={onOpen}
            />
          ))}
          {deals.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-subtle">
              Arraste um cliente para cá
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
