import { useEffect, useRef } from "react";
import { addMinutes, format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";

import {
  COMPACT_MIN,
  END_HOUR,
  GRID_MINUTES,
  HOUR_H,
  PX_PER_MIN,
  START_HOUR,
  eventsOnDay,
  formatTime,
  placeDay,
} from "./calendar";
import { EventBlock } from "./EventBlock";
import { minutesOfDay } from "./tz";
import type { AgendaEvent, EventDraft } from "./types";
import { useGridDrag } from "./useGridDrag";

interface Props {
  days: Date[];
  events: AgendaEvent[];
  now: Date;
  onCreate: (draft: EventDraft) => void;
  onEdit: (event: AgendaEvent) => void;
  onMove: (event: AgendaEvent, start: Date, end: Date) => void;
}

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const GUTTER = "3.5rem";

export function TimeGrid({ days, events, now, onCreate, onEdit, onMove }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const { drag, startCreate, startMove, shouldIgnoreClick } = useGridDrag({
    days,
    columnsRef,
    onCreate,
    onMove,
  });

  // Ao abrir, a grade já mostra a hora atual (uma hora antes, para dar contexto).
  const nowMin = minutesOfDay(now);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (nowMin - START_HOUR * 60 - 60) * PX_PER_MIN);
    // Só na montagem: não queremos pular a rolagem a cada minuto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = { gridTemplateColumns: `${GUTTER} repeat(${days.length}, minmax(0, 1fr))` };
  const allDay = days.map((d) => eventsOnDay(d, events).filter((e) => e.row.all_day));
  const hasAllDay = allDay.some((list) => list.length > 0);
  const nowTop = (nowMin - START_HOUR * 60) * PX_PER_MIN;
  const nowVisible = nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;

  return (
    <div
      ref={scrollRef}
      className="scrollbar-thin relative min-h-0 flex-1 overflow-auto bg-background"
    >
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="grid" style={template}>
          <div />
          {days.map((d) => {
            const today = isSameDay(d, now);
            return (
              <div
                key={d.toISOString()}
                className={cn("relative border-l border-border py-2 text-center")}
              >
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-widest",
                    today ? "text-foreground" : "text-subtle",
                  )}
                >
                  {format(d, "EEE", { locale: ptBR }).replace(".", "")}
                </p>
                <p
                  className={cn(
                    "mx-auto mt-0.5 grid size-8 place-items-center rounded-full font-display text-[17px] font-semibold tabular-nums",
                    today ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                  aria-current={today ? "date" : undefined}
                >
                  {format(d, "d")}
                </p>
              </div>
            );
          })}
        </div>
        {hasAllDay && (
          <div className="grid border-t border-border" style={template}>
            <div className="px-1 py-1.5 text-right text-[10px] text-subtle">Dia todo</div>
            {allDay.map((list, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-1 border-l border-border p-1">
                {list.map((ev) => (
                  <EventBlock key={ev.row.id} event={ev} variant="chip" onEdit={onEdit} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid" style={template}>
        <div className="relative" style={{ height: GRID_MINUTES * PX_PER_MIN }}>
          {HOURS.map((h, i) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-subtle tabular-nums"
              style={{ top: i * HOUR_H }}
            >
              {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
            </span>
          ))}
          {nowVisible && (
            <span
              className="absolute right-1 z-10 -translate-y-1/2 rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums"
              style={{ top: nowTop }}
            >
              {formatTime(now)}
            </span>
          )}
        </div>

        <div
          ref={columnsRef}
          className="relative grid select-none"
          style={{
            gridColumn: `2 / span ${days.length}`,
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            height: GRID_MINUTES * PX_PER_MIN,
            backgroundImage: `repeating-linear-gradient(to bottom, var(--color-border) 0 1px, transparent 1px ${HOUR_H}px)`,
          }}
        >
          {days.map((day, dayIndex) => {
            const today = isSameDay(day, now);
            const placed = placeDay(day, eventsOnDay(day, events));
            const ghost =
              drag?.kind === "create" && drag.dayIndex === dayIndex
                ? {
                    from: Math.min(drag.anchorMin, drag.currentMin),
                    to: Math.max(drag.anchorMin, drag.currentMin) + 15,
                  }
                : null;
            return (
              <div
                key={day.toISOString()}
                onPointerDown={(e) => startCreate(e, dayIndex)}
                className={cn(
                  "relative cursor-crosshair border-l border-border",
                  today && "bg-primary-soft/30",
                )}
              >
                {placed.map((p) => {
                  const moving = drag?.kind === "move" && drag.event.row.id === p.event.row.id;
                  const offsetX = moving ? drag.deltaDays * 100 : 0;
                  const offsetY = moving ? drag.deltaMin * PX_PER_MIN : 0;
                  const widthPct = 100 / p.columns;
                  return (
                    <EventBlock
                      key={p.event.row.id}
                      event={p.event}
                      variant={p.minutes < COMPACT_MIN ? "compact" : "grid"}
                      isDragging={moving && drag.moved}
                      onEdit={onEdit}
                      onPointerDown={startMove}
                      shouldIgnoreClick={shouldIgnoreClick}
                      className="absolute"
                      style={{
                        top: p.top + 1,
                        height: p.height - 2,
                        left: `calc(${p.column * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        transform: moving
                          ? `translate(calc(${offsetX}% * ${p.columns}), ${offsetY}px)`
                          : undefined,
                      }}
                    />
                  );
                })}
                {ghost && (
                  <div
                    className="pointer-events-none absolute inset-x-1 rounded-lg border border-primary-line bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary tabular-nums"
                    style={{
                      top: ghost.from * PX_PER_MIN,
                      height: (ghost.to - ghost.from) * PX_PER_MIN,
                    }}
                  >
                    {formatTime(
                      addMinutes(
                        new Date(day.getFullYear(), day.getMonth(), day.getDate(), START_HOUR),
                        ghost.from,
                      ),
                    )}
                    {" – "}
                    {formatTime(
                      addMinutes(
                        new Date(day.getFullYear(), day.getMonth(), day.getDate(), START_HOUR),
                        ghost.to,
                      ),
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {nowVisible && days.some((d) => isSameDay(d, now)) && (
            <div
              className="pointer-events-none absolute inset-x-0 z-10"
              style={{ top: nowTop }}
              aria-hidden
            >
              <div className="relative h-0.5 bg-primary">
                <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-primary" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
