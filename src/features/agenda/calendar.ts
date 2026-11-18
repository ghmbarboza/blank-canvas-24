import {
  addDays,
  addMonths,
  addWeeks,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isSameYear,
  max as maxDate,
  min as minDate,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import type { AgendaEvent, AgendaView, WallRange } from "./types";

export const HOUR_H = 64;
export const START_HOUR = 7;
export const END_HOUR = 21;
export const SLOT_MIN = 15;
export const COMPACT_MIN = 45;
export const GRID_MINUTES = (END_HOUR - START_HOUR) * 60;
export const PX_PER_MIN = HOUR_H / 60;

const WEEK = { weekStartsOn: 1 } as const;

export function rangeFor(view: AgendaView, anchor: Date): WallRange {
  if (view === "day") {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor, WEEK);
    return { start, end: addDays(start, 7) };
  }
  const start = startOfWeek(startOfMonth(anchor), WEEK);
  const end = addDays(endOfWeek(endOfMonth(anchor), WEEK), 1);
  return { start: startOfDay(start), end: startOfDay(end) };
}

export function shiftAnchor(view: AgendaView, anchor: Date, dir: 1 | -1): Date {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addWeeks(anchor, dir);
  return addMonths(anchor, dir);
}

export function daysIn(range: WallRange): Date[] {
  const out: Date[] = [];
  for (let d = range.start; d < range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function titleFor(view: AgendaView, anchor: Date): string {
  if (view === "day") return capitalize(format(anchor, "EEEE, d 'de' MMMM", { locale: ptBR }));
  if (view === "month") return capitalize(format(anchor, "MMMM 'de' yyyy", { locale: ptBR }));
  const start = startOfWeek(anchor, WEEK);
  const end = addDays(start, 6);
  // Curto como na referência: "26 de out. a 1 de nov. de 2026" / "12 a 18 de outubro de 2026".
  if (isSameMonth(start, end))
    return `${format(start, "d")} a ${format(end, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  const tail = format(end, "d 'de' MMM 'de' yyyy", { locale: ptBR });
  const head = isSameYear(start, end)
    ? format(start, "d 'de' MMM", { locale: ptBR })
    : format(start, "d 'de' MMM 'de' yyyy", { locale: ptBR });
  return `${head} a ${tail}`;
}

export function formatTime(d: Date): string {
  return format(d, "HH:mm");
}

export function formatSpan(ev: Pick<AgendaEvent, "start" | "end" | "row">): string {
  if (ev.row.all_day) return "Dia inteiro";
  return `${formatTime(ev.start)} – ${formatTime(ev.end)}`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export interface PlacedEvent {
  event: AgendaEvent;
  top: number;
  height: number;
  column: number;
  columns: number;
  minutes: number;
}

// Posiciona os eventos de um dia na grade e divide em colunas os que se sobrepõem.
export function placeDay(day: Date, events: AgendaEvent[]): PlacedEvent[] {
  const gridStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), START_HOUR);
  const gridEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), END_HOUR);
  const visible = events
    .filter((e) => !e.row.all_day && e.start < gridEnd && e.end > gridStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());

  const placed: PlacedEvent[] = [];
  let cluster: { item: PlacedEvent; end: Date }[] = [];
  let clusterEnd = gridStart;

  const flush = () => {
    const columns = cluster.reduce((n, c) => Math.max(n, c.item.column + 1), 1);
    for (const c of cluster) placed.push({ ...c.item, columns });
    cluster = [];
  };

  for (const event of visible) {
    if (cluster.length && event.start >= clusterEnd) flush();
    const from = maxDate([event.start, gridStart]);
    const to = minDate([event.end, gridEnd]);
    const minutes = Math.max(differenceInMinutes(event.end, event.start), 0);
    const used = new Set(cluster.filter((c) => c.end > event.start).map((c) => c.item.column));
    let column = 0;
    while (used.has(column)) column += 1;
    const item: PlacedEvent = {
      event,
      top: differenceInMinutes(from, gridStart) * PX_PER_MIN,
      height: Math.max(differenceInMinutes(to, from) * PX_PER_MIN, 22),
      column,
      columns: 1,
      minutes,
    };
    cluster.push({ item, end: event.end });
    clusterEnd = cluster.length === 1 ? event.end : maxDate([clusterEnd, event.end]);
  }
  if (cluster.length) flush();
  return placed;
}

export function eventsOnDay(day: Date, events: AgendaEvent[]): AgendaEvent[] {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  return events
    .filter(
      (e) =>
        e.start < end &&
        (e.end > start || (e.end.getTime() === e.start.getTime() && e.start >= start)),
    )
    .sort(
      (a, b) =>
        Number(b.row.all_day) - Number(a.row.all_day) || a.start.getTime() - b.start.getTime(),
    );
}

// Minuto da grade (a partir de START_HOUR) → hora de parede, arredondado para baixo em blocos.
export function slotAt(day: Date, offsetPx: number): Date {
  const raw = Math.max(0, Math.min(GRID_MINUTES - SLOT_MIN, offsetPx / PX_PER_MIN));
  const snapped = Math.floor(raw / SLOT_MIN) * SLOT_MIN;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), START_HOUR, snapped);
}
