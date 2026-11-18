// Fuso da conta sem biblioteca nova.
// Trabalhamos com "hora de parede": um Date local cujos campos (ano, mês, dia, hora, minuto) são os
// do fuso da conta. Toda a matemática de calendário (date-fns) roda sobre esse Date; na fronteira com
// o banco convertemos para o instante real (UTC) com `fromWall`.

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = partsCache.get(timeZone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  partsCache.set(timeZone, fmt);
  return fmt;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(instant: Date, timeZone: string): WallParts {
  const out: WallParts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    const n = Number(p.value);
    if (p.type === "year") out.year = n;
    else if (p.type === "month") out.month = n;
    else if (p.type === "day") out.day = n;
    else if (p.type === "hour") out.hour = n === 24 ? 0 : n;
    else if (p.type === "minute") out.minute = n;
    else if (p.type === "second") out.second = n;
  }
  return out;
}

function offsetMs(utcMs: number, timeZone: string): number {
  const p = wallParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Instante real (ISO ou Date) → hora de parede no fuso.
export function toWall(instant: string | Date, timeZone: string): Date {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const p = wallParts(d, timeZone);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// Hora de parede no fuso → instante real.
export function fromWall(wall: Date, timeZone: string): Date {
  const guess = Date.UTC(
    wall.getFullYear(),
    wall.getMonth(),
    wall.getDate(),
    wall.getHours(),
    wall.getMinutes(),
    wall.getSeconds(),
  );
  const first = guess - offsetMs(guess, timeZone);
  // Segunda passada acerta a virada de horário de verão.
  return new Date(guess - offsetMs(first, timeZone));
}

export function nowWall(timeZone: string): Date {
  return toWall(new Date(), timeZone);
}

export function minutesOfDay(wall: Date): number {
  return wall.getHours() * 60 + wall.getMinutes();
}
