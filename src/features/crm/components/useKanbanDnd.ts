import { useMemo, useState } from "react";
import type { DragEndEvent, DragOverEvent, DragStartEvent, UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { positionInList } from "../position";
import { stageKind, type BoardDeal, type Stage } from "../types";

type Columns = Record<string, string[]>;

export interface DropResult {
  deal: BoardDeal;
  stage: Stage;
  position: number;
}

function findContainer(cols: Columns, id: UniqueIdentifier): string | undefined {
  const key = String(id);
  if (key in cols) return key;
  return Object.keys(cols).find((k) => cols[k]?.includes(key));
}

type Options = {
  stages: Stage[];
  deals: BoardDeal[];
  // Devolve uma promessa: o quadro mantém a ordem local até o servidor responder.
  onDrop: (drop: DropResult) => Promise<unknown>;
  onDropLost: (drop: DropResult) => void;
};

// Estado do arrasto entre colunas (padrão multi-container do dnd-kit) com a ordem do servidor por baixo.
export function useKanbanDnd({ stages, deals, onDrop, onDropLost }: Options) {
  const serverColumns = useMemo<Columns>(() => {
    const cols: Columns = Object.fromEntries(stages.map((s) => [s.id, [] as string[]]));
    const sorted = [...deals].sort((a, b) => a.position - b.position);
    for (const d of sorted) cols[d.stage_id]?.push(d.id);
    return cols;
  }, [stages, deals]);
  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const [localColumns, setLocalColumns] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const columns = localColumns ?? serverColumns;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setLocalColumns(serverColumns);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setLocalColumns((prev) => {
      const cols = prev ?? serverColumns;
      const from = findContainer(cols, active.id);
      const to = findContainer(cols, over.id);
      if (!from || !to || from === to) return prev;
      const id = String(active.id);
      const target = cols[to] ?? [];
      const overIndex = target.indexOf(String(over.id));
      const translated = active.rect.current.translated;
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
      const insertAt = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
      return {
        ...cols,
        [from]: (cols[from] ?? []).filter((x) => x !== id),
        [to]: [...target.slice(0, insertAt), id, ...target.slice(insertAt)],
      };
    });
  }

  function cancel() {
    setActiveId(null);
    setLocalColumns(null);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const cols = localColumns ?? serverColumns;
    const id = String(active.id);
    const container = findContainer(cols, id);
    const deal = dealById.get(id);
    const stage = container ? stageById.get(container) : undefined;
    if (!over || !container || !deal || !stage) {
      setLocalColumns(null);
      return;
    }
    let list = cols[container] ?? [];
    const overId = String(over.id);
    if (findContainer(cols, overId) === container && overId !== id && list.includes(overId)) {
      list = arrayMove(list, list.indexOf(id), list.indexOf(overId));
    }
    const finalCols = { ...cols, [container]: list };
    const sameSpot =
      deal.stage_id === container && (serverColumns[container] ?? []).join() === list.join();
    if (sameSpot) {
      setLocalColumns(null);
      return;
    }
    const position = positionInList(list, id, (x) => dealById.get(x)?.position);
    const drop = { deal, stage, position };
    setLocalColumns(finalCols);
    if (stageKind(stage) === "lost" && deal.stage_id !== stage.id) {
      onDropLost(drop);
      return;
    }
    void onDrop(drop).finally(() => setLocalColumns(null));
  }

  return {
    columns,
    activeDeal: activeId ? dealById.get(activeId) : undefined,
    dealById,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: cancel },
    // Depois do diálogo de motivo: confirma (mantém até o servidor) ou desfaz.
    settle: (p: Promise<unknown> | null) => {
      if (p) void p.finally(() => setLocalColumns(null));
      else setLocalColumns(null);
    },
  };
}
