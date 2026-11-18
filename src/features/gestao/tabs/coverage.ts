// Quantas pessoas a escala gravada põe em cada hora do dia (hora local da máquina).

export function at(day: string, hour: number, minute = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour, minute);
}

export function coverageFromShifts(
  shifts: { starts_at: string; ends_at: string }[],
  day: string,
): number[] {
  const c = new Array<number>(24).fill(0);
  for (const s of shifts) {
    const start = new Date(s.starts_at).getTime();
    const end = new Date(s.ends_at).getTime();
    for (let h = 0; h < 24; h += 1) {
      if (start < at(day, h + 1).getTime() && end > at(day, h).getTime()) c[h] = (c[h] ?? 0) + 1;
    }
  }
  return c;
}
