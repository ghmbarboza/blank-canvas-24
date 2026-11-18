import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { addDays, addMinutes } from "date-fns";

import { GRID_MINUTES, PX_PER_MIN, SLOT_MIN, START_HOUR } from "./calendar";
import type { AgendaEvent, EventDraft } from "./types";

type Drag =
  | { kind: "create"; dayIndex: number; anchorMin: number; currentMin: number }
  | {
      kind: "move";
      event: AgendaEvent;
      originX: number;
      originY: number;
      deltaMin: number;
      deltaDays: number;
      moved: boolean;
    };

const MOVE_THRESHOLD_PX = 4;

function snap(min: number): number {
  return Math.max(0, Math.min(GRID_MINUTES - SLOT_MIN, Math.floor(min / SLOT_MIN) * SLOT_MIN));
}

interface Options {
  days: Date[];
  columnsRef: RefObject<HTMLDivElement | null>;
  onCreate: (draft: EventDraft) => void;
  onMove: (event: AgendaEvent, start: Date, end: Date) => void;
}

// Arraste na grade: num horário vazio cria (duração em blocos de 15 min); num evento, move.
export function useGridDrag({ days, columnsRef, onCreate, onMove }: Options) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const ignoreClickUntil = useRef(0);

  const update = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const minuteAt = useCallback(
    (clientY: number): number => {
      const rect = columnsRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return snap((clientY - rect.top) / PX_PER_MIN);
    },
    [columnsRef],
  );

  const startCreate = useCallback(
    (e: PointerEvent<HTMLDivElement>, dayIndex: number) => {
      // Toque rola a grade; criar por toque fica no botão "Novo evento".
      if (e.button !== 0 || e.pointerType === "touch" || e.target !== e.currentTarget) return;
      e.preventDefault();
      const min = minuteAt(e.clientY);
      update({ kind: "create", dayIndex, anchorMin: min, currentMin: min });
    },
    [minuteAt, update],
  );

  const startMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>, event: AgendaEvent) => {
      if (e.button !== 0 || e.pointerType === "touch" || event.row.all_day) return;
      update({
        kind: "move",
        event,
        originX: e.clientX,
        originY: e.clientY,
        deltaMin: 0,
        deltaDays: 0,
        moved: false,
      });
    },
    [update],
  );

  const active = drag !== null;
  useEffect(() => {
    if (!active) return;
    const colWidth = () => {
      const w = columnsRef.current?.getBoundingClientRect().width ?? 0;
      return days.length ? w / days.length : 1;
    };
    const handleMove = (e: globalThis.PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      if (cur.kind === "create") {
        update({ ...cur, currentMin: minuteAt(e.clientY) });
        return;
      }
      const dx = e.clientX - cur.originX;
      const dy = e.clientY - cur.originY;
      const moved =
        cur.moved || Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX;
      const deltaMin = Math.round(dy / PX_PER_MIN / SLOT_MIN) * SLOT_MIN;
      const rawDays = Math.round(dx / colWidth());
      const deltaDays = days.length > 1 ? rawDays : 0;
      update({ ...cur, moved, deltaMin, deltaDays });
    };
    const handleUp = () => {
      const cur = dragRef.current;
      update(null);
      if (!cur) return;
      if (cur.kind === "create") {
        const day = days[cur.dayIndex];
        if (!day) return;
        const from = Math.min(cur.anchorMin, cur.currentMin);
        const to = Math.max(cur.anchorMin, cur.currentMin) + SLOT_MIN;
        const base = new Date(day.getFullYear(), day.getMonth(), day.getDate(), START_HOUR);
        // Um clique simples vira 30 min; arraste usa o intervalo marcado.
        const end = to - from <= SLOT_MIN ? from + 30 : to;
        onCreate({ start: addMinutes(base, from), end: addMinutes(base, end) });
        return;
      }
      if (!cur.moved) return;
      ignoreClickUntil.current = Date.now() + 400;
      if (!cur.deltaMin && !cur.deltaDays) return;
      const shift = (d: Date) => addMinutes(addDays(d, cur.deltaDays), cur.deltaMin);
      onMove(cur.event, shift(cur.event.start), shift(cur.event.end));
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [active, columnsRef, days, minuteAt, onCreate, onMove, update]);

  // Só o clique que encerra o arraste é ignorado (logo após soltar).
  const shouldIgnoreClick = useCallback(() => Date.now() < ignoreClickUntil.current, []);

  return { drag, startCreate, startMove, shouldIgnoreClick };
}

export type GridDrag = ReturnType<typeof useGridDrag>["drag"];
