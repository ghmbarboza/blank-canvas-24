// Horários livres de uma página de agendamento. Puro e independente do fuso da máquina:
// toda conversão passa pelo fuso da conta (Intl), então roda igual no navegador e no servidor.

export interface TimeRange {
  start: string; // "09:00"
  end: string; // "18:00"
}
/** Chave = dia da semana (0 = domingo … 6 = sábado). */
export type Availability = Partial<Record<string, TimeRange[]>>;

export interface BusyBlock {
  start: number; // ms UTC
  end: number;
}

export interface SlotOptions {
  timeZone: string;
  now: number; // ms UTC
  availability: Availability;
  durationMin: number;
  bufferMin: number;
  stepMin: number;
  minNoticeMin: number;
  windowDays: number;
  busy: BusyBlock[];
}

export interface Slot {
  start: string; // ISO UTC
  end: string;
  date: string; // "2026-10-22" no fuso da conta
  label: string; // "14:30"
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const out: ZonedParts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, weekday: 0 };
  for (const p of fmt(timeZone).formatToParts(new Date(ms))) {
    if (p.type === "year") out.year = Number(p.value);
    else if (p.type === "month") out.month = Number(p.value);
    else if (p.type === "day") out.day = Number(p.value);
    else if (p.type === "hour") out.hour = Number(p.value) % 24;
    else if (p.type === "minute") out.minute = Number(p.value);
    else if (p.type === "weekday") out.weekday = WEEKDAY[p.value] ?? 0;
  }
  return out;
}

/** Hora de parede no fuso → instante UTC (ms), com correção de horário de verão. */
export function zonedToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timeZone: string,
): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const offset = (ms: number) => {
    const p = zonedParts(ms, timeZone);
    return (
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000
    );
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function computeSlots(o: SlotOptions): Slot[] {
  const out: Slot[] = [];
  const earliest = o.now + o.minNoticeMin * 60_000;
  const today = zonedParts(o.now, o.timeZone);
  const dur = o.durationMin * 60_000;
  const buf = o.bufferMin * 60_000;
  for (let i = 0; i <= o.windowDays; i++) {
    // meio-dia do dia i no fuso evita erro de virada de data
    const noon = zonedToUtc(today.year, today.month, today.day, 12, 0, o.timeZone) + i * 86_400_000;
    const p = zonedParts(noon, o.timeZone);
    const ranges = o.availability[String(p.weekday)] ?? [];
    const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    for (const r of ranges) {
      const a = toMinutes(r.start);
      const b = toMinutes(r.end);
      if (a === null || b === null || b <= a) continue;
      for (let t = a; t + o.durationMin <= b; t += o.stepMin) {
        const start = zonedToUtc(p.year, p.month, p.day, Math.floor(t / 60), t % 60, o.timeZone);
        const end = start + dur;
        if (start < earliest) continue;
        const clash = o.busy.some((bz) => start < bz.end + buf && end + buf > bz.start);
        if (clash) continue;
        out.push({
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          date,
          label: `${pad(Math.floor(t / 60))}:${pad(t % 60)}`,
        });
      }
    }
  }
  return out;
}

/** Escolhe quem atende no rodízio: menor carga relativa ao peso; empate pelo id (estável). */
export function pickRoundRobin(
  members: { user_id: string; weight?: number }[],
  load: Record<string, number>,
): string | null {
  const valid = members.filter((m) => m.user_id && (m.weight ?? 1) > 0);
  if (valid.length === 0) return null;
  return [...valid].sort((x, y) => {
    const rx = (load[x.user_id] ?? 0) / (x.weight ?? 1);
    const ry = (load[y.user_id] ?? 0) / (y.weight ?? 1);
    return rx - ry || x.user_id.localeCompare(y.user_id);
  })[0]!.user_id;
}
