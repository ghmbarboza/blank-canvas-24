// Montagem de escala (turnos com pausa) e aderência. Funções puras.

export interface ShiftTemplate {
  /** Horas de turno, contando a pausa. */
  hours: number;
  /** Duração da pausa principal em minutos (0 = sem pausa). */
  breakMinutes: number;
  label: string;
}

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { hours: 9, breakMinutes: 60, label: "8 h com 1 h de almoço" },
  { hours: 6, breakMinutes: 20, label: "6 h com 20 min de pausa" },
  { hours: 4, breakMinutes: 0, label: "4 h corridas" },
];

export interface SuggestedShift {
  startHour: number;
  endHour: number;
  /** Hora de início da pausa (no meio do turno) ou null. */
  breakStartHour: number | null;
  breakMinutes: number;
}

/**
 * Cobre a necessidade por hora com turnos do modelo escolhido, do jeito guloso: em cada hora em que
 * falta gente, abre turnos que começam ali. A pausa fica no meio do turno; a hora da pausa conta
 * como meia pessoa quando a pausa é de até 30 min e como zero quando é maior.
 */
export function suggestShifts(need: number[], template: ShiftTemplate): SuggestedShift[] {
  const hours = Math.max(1, Math.min(12, Math.round(template.hours)));
  const coverage = new Array<number>(24).fill(0);
  const shifts: SuggestedShift[] = [];
  const lastStart = 24 - Math.min(hours, 24);
  for (let h = 0; h < 24; h += 1) {
    const want = Math.max(0, Math.ceil(need[h] ?? 0));
    let guard = 0;
    while ((coverage[h] ?? 0) < want && guard < 500) {
      guard += 1;
      const start = Math.min(h, lastStart);
      const end = Math.min(24, start + hours);
      let breakStart =
        template.breakMinutes > 0 && end - start >= 4
          ? start + Math.floor((end - start) / 2)
          : null;
      // A pausa nunca cai na hora que estamos cobrindo agora.
      if (breakStart === h) breakStart = h + 1 < end - 1 ? h + 1 : h - 1 > start ? h - 1 : null;
      shifts.push({
        startHour: start,
        endHour: end,
        breakStartHour: breakStart,
        breakMinutes: template.breakMinutes,
      });
      for (let x = start; x < end; x += 1) {
        const value = x === breakStart ? (template.breakMinutes <= 30 ? 0.5 : 0) : 1;
        coverage[x] = (coverage[x] ?? 0) + value;
      }
    }
  }
  return shifts;
}

/** Quantas pessoas a escala cobre em cada hora (considerando as pausas). */
export function coverageOf(shifts: SuggestedShift[]): number[] {
  const c = new Array<number>(24).fill(0);
  for (const s of shifts)
    for (let x = s.startHour; x < s.endHour; x += 1)
      c[x] = (c[x] ?? 0) + (x === s.breakStartHour ? (s.breakMinutes <= 30 ? 0.5 : 0) : 1);
  return c;
}

// ───────────────────────── aderência ─────────────────────────

export interface ShiftWindow {
  userId: string;
  start: number; // ms
  end: number; // ms
  breaks: { start: number; end: number }[];
}

export interface PresenceInterval {
  userId: string;
  status: "available" | "busy" | "break" | "offline" | string;
  start: number; // ms
  end: number | null; // ms; null = ainda neste estado
}

export interface Adherence {
  userId: string;
  scheduledMinutes: number;
  inAdherenceMinutes: number;
  /** 0..1 */
  adherence: number;
  /** Minutos fora da escala em que a pessoa ficou disponível (conformidade extra). */
  outOfShiftMinutes: number;
}

const WORKING = new Set(["available", "busy"]);

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Janelas de trabalho do turno (turno menos pausas), ordenadas e sem sobreposição. */
export function workingWindows(s: ShiftWindow): { start: number; end: number }[] {
  const breaks = [...s.breaks]
    .map((b) => ({ start: Math.max(s.start, b.start), end: Math.min(s.end, b.end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let cursor = s.start;
  for (const b of breaks) {
    if (b.start > cursor) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < s.end) out.push({ start: cursor, end: s.end });
  return out;
}

/**
 * Aderência = minutos em que a pessoa estava disponível ou atendendo, dentro do horário de
 * trabalho da escala, ÷ minutos de trabalho escalados. Pausa escalada não conta contra.
 */
export function computeAdherence(
  shifts: ShiftWindow[],
  presence: PresenceInterval[],
  now: number = Date.now(),
): Adherence[] {
  const users = new Set(shifts.map((s) => s.userId));
  const result: Adherence[] = [];
  for (const userId of users) {
    const windows = shifts
      .filter((s) => s.userId === userId)
      .flatMap((s) => workingWindows(s))
      .map((w) => ({ start: w.start, end: Math.min(w.end, now) }))
      .filter((w) => w.end > w.start);
    const mine = presence
      .filter((p) => p.userId === userId && WORKING.has(p.status))
      .map((p) => ({ start: p.start, end: p.end ?? now }));
    let scheduled = 0;
    let inside = 0;
    for (const w of windows) {
      scheduled += w.end - w.start;
      for (const p of mine) inside += overlap(w.start, w.end, p.start, p.end);
    }
    const presentTotal = mine.reduce((s, p) => s + Math.max(0, p.end - p.start), 0);
    const scheduledMinutes = Math.round(scheduled / 60000);
    const inMinutes = Math.round(Math.min(inside, scheduled) / 60000);
    result.push({
      userId,
      scheduledMinutes,
      inAdherenceMinutes: inMinutes,
      adherence: scheduled > 0 ? Math.min(1, inside / scheduled) : 1,
      outOfShiftMinutes: Math.max(0, Math.round((presentTotal - inside) / 60000)),
    });
  }
  return result.sort((a, b) => a.adherence - b.adherence);
}

/** Converte um turno do banco (horários ISO e pausas em jsonb) para a janela usada no cálculo. */
export function toShiftWindow(row: {
  user_id: string;
  starts_at: string;
  ends_at: string;
  breaks: unknown;
}): ShiftWindow {
  const breaks = Array.isArray(row.breaks)
    ? (row.breaks as unknown[]).flatMap((b) => {
        if (!b || typeof b !== "object") return [];
        const o = b as Record<string, unknown>;
        const s = typeof o["start"] === "string" ? Date.parse(o["start"]) : NaN;
        const e = typeof o["end"] === "string" ? Date.parse(o["end"]) : NaN;
        return Number.isFinite(s) && Number.isFinite(e) && e > s ? [{ start: s, end: e }] : [];
      })
    : [];
  return {
    userId: row.user_id,
    start: Date.parse(row.starts_at),
    end: Date.parse(row.ends_at),
    breaks,
  };
}
