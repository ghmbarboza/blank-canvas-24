import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { TeamMember } from "@/features/contacts/types";

import { stageKind, type BoardDeal, type Stage } from "../types";
import { DealCard } from "./DealCard";
import { KanbanColumn } from "./KanbanColumn";
import { LostReasonDialog } from "./LostReasonDialog";
import { useKanbanDnd, type DropResult } from "./useKanbanDnd";

type Props = {
  stages: Stage[];
  deals: BoardDeal[];
  members: Map<string, TeamMember>;
  onOpenDeal: (id: string) => void;
  onMove: (drop: DropResult & { lostReason?: string | undefined }) => Promise<unknown>;
};

const SCREEN_READER = {
  draggable:
    "Espaço pega o cartão. Setas movem entre posições e colunas. Espaço solta, Esc cancela.",
};

export function KanbanBoard({ stages, deals, members, onOpenDeal, onMove }: Props) {
  const [pendingLost, setPendingLost] = useState<DropResult | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { columns, activeDeal, dealById, handlers, settle } = useKanbanDnd({
    stages,
    deals,
    onDrop: (drop) => onMove(drop),
    onDropLost: setPendingLost,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const stageName = (id: string | number | undefined) =>
    stages.find((s) => s.id === String(id))?.name ?? "";
  const titleOf = (id: string | number) => dealById.get(String(id))?.title ?? "Cartão";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(active.id)} sobre ${stageName(over.id) || titleOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${titleOf(active.id)} solto.` : `${titleOf(active.id)} voltou ao lugar.`,
    onDragCancel: ({ active }) => `Arrasto cancelado. ${titleOf(active.id)} voltou ao lugar.`,
  };

  // Etapas abertas na ordem; ganho/perdido sempre à direita.
  const ordered = useMemo(
    () => [
      ...stages.filter((s) => stageKind(s) === "open"),
      ...stages.filter((s) => stageKind(s) !== "open"),
    ],
    [stages],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER }}
      {...handlers}
    >
      <div
        className="flex min-h-0 flex-1 snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overflow-y-hidden p-4 md:snap-none md:p-6"
        role="region"
        aria-label="Quadro da carteira"
      >
        {ordered.map((stage) => {
          const closed = stageKind(stage) !== "open";
          const ids = columns[stage.id] ?? [];
          const list = ids
            .map((id) => dealById.get(id))
            .filter((d): d is BoardDeal => d !== undefined);
          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              deals={list}
              members={members}
              onOpen={onOpenDeal}
              collapsible={closed}
              collapsed={closed && !expanded[stage.id]}
              onToggleCollapsed={() => setExpanded((e) => ({ ...e, [stage.id]: !e[stage.id] }))}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {activeDeal ? (
          <DealCard
            deal={activeDeal}
            owner={activeDeal.owner_user_id ? members.get(activeDeal.owner_user_id) : undefined}
            overlay
            className="w-[280px]"
          />
        ) : null}
      </DragOverlay>
      <LostReasonDialog
        open={pendingLost !== null}
        dealTitle={pendingLost?.deal.title ?? ""}
        onCancel={() => {
          setPendingLost(null);
          settle(null);
        }}
        onConfirm={(reason) => {
          if (!pendingLost) return;
          const drop = pendingLost;
          setPendingLost(null);
          settle(onMove({ ...drop, lostReason: reason }));
        }}
      />
    </DndContext>
  );
}
