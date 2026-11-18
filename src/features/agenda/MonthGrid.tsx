import { format, isSameDay, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";

import { eventsOnDay } from "./calendar";
import { EventBlock } from "./EventBlock";
import type { AgendaEvent } from "./types";

interface Props {
  days: Date[];
  anchor: Date;
  events: AgendaEvent[];
  now: Date;
  onEdit: (event: AgendaEvent) => void;
  onOpenDay: (day: Date) => void;
}

const MAX_PER_DAY = 3;
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function MonthGrid({ days, anchor, events, now, onEdit, onOpenDay }: Props) {
  const weeks = Math.ceil(days.length / 7);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-background">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-widest text-subtle"
          >
            {w}
          </div>
        ))}
      </div>
      <div
        className="grid min-h-[36rem] flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(7rem, 1fr))` }}
      >
        {days.map((day) => {
          const list = eventsOnDay(day, events);
          const extra = list.length - MAX_PER_DAY;
          const today = isSameDay(day, now);
          const outside = !isSameMonth(day, anchor);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex min-w-0 flex-col gap-1 border-r border-b border-border p-1.5",
                outside && "bg-surface-2/60",
                today && "bg-primary-soft/30",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenDay(day)}
                aria-label={`Ver ${format(day, "d 'de' MMMM", { locale: ptBR })}`}
                className={cn(
                  "grid size-7 cursor-pointer place-items-center self-end rounded-full text-[12px] font-semibold tabular-nums transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  today && "bg-primary text-primary-foreground hover:bg-primary-hover",
                  outside && !today && "text-subtle",
                )}
              >
                {format(day, "d")}
              </button>
              {list.slice(0, MAX_PER_DAY).map((ev) => (
                <EventBlock key={ev.row.id} event={ev} variant="chip" onEdit={onEdit} />
              ))}
              {extra > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className="cursor-pointer rounded-md px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  +{extra} {extra === 1 ? "evento" : "eventos"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
