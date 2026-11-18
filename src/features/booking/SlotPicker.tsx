import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { dayLabel } from "./day-label";
import type { Slot } from "./slots";

// Escolha de dia e horário entre os livres (página de agendamento e remarcação pelo convidado).
export function SlotPicker({
  slots,
  tz,
  pending = false,
  onPick,
}: {
  slots: Slot[];
  tz: string;
  pending?: boolean;
  onPick: (s: Slot) => void;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [slots]);
  const days = [...byDay.keys()];
  const visibleDays = days.slice(offset, offset + 5);
  const activeDay = day && byDay.has(day) ? day : (days[0] ?? null);

  return (
    <>
      {pending ? (
        <div className="mt-5 grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
          Nenhum horário livre nos próximos dias. Tente de novo mais tarde.
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              aria-label="Dias anteriores"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - 5))}
              className="rounded-full p-2 text-muted-foreground hover:bg-surface-2 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="grid flex-1 grid-cols-5 gap-2">
              {visibleDays.map((d) => {
                const l = dayLabel(d, tz);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDay(d)}
                    className={cn(
                      "rounded-2xl border px-1 py-3 text-center transition-colors",
                      d === activeDay
                        ? "border-primary bg-primary-soft text-foreground"
                        : "border-border hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    <span className="block text-[11px] capitalize opacity-70">{l.weekday}</span>
                    <span className="block font-display text-[20px] font-semibold tabular-nums">
                      {l.day}
                    </span>
                    <span className="block text-[11px] opacity-70">{l.month}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label="Próximos dias"
              disabled={offset + 5 >= days.length}
              onClick={() => setOffset((o) => o + 5)}
              className="rounded-full p-2 text-muted-foreground hover:bg-surface-2 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {activeDay && (
            <>
              <p className="mt-6 text-[13px] text-muted-foreground first-letter:uppercase">
                {dayLabel(activeDay, tz).full}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(byDay.get(activeDay) ?? []).map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => onPick(s)}
                    className="rounded-xl border border-border py-2.5 text-[14px] font-medium tabular-nums transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
