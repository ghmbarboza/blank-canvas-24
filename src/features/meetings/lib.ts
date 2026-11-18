import { differenceInCalendarDays, startOfDay } from "date-fns";

// Regras puras da lista de reuniões: em que grupo cada uma cai, a nota e a duração.

export interface MeetingLike {
  id: string;
  status: string;
  title: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  score: unknown;
}

export interface MeetingGroup<T> {
  id: string;
  label: string;
  items: T[];
}

/** Quando a reunião aconteceu (ou vai acontecer). */
export function meetingWhen(m: MeetingLike): string {
  return m.started_at ?? m.scheduled_start ?? m.created_at;
}

/** Nota geral da rubrica, se já saiu. */
export function meetingScore(m: { score: unknown }): number | null {
  const total = (m.score as { total?: unknown } | null)?.total;
  return typeof total === "number" && Number.isFinite(total) ? Math.round(total) : null;
}

/** Duração em minutos: real se começou e terminou, senão a marcada. */
export function meetingDurationMin(m: MeetingLike): number | null {
  const start = m.started_at ?? m.scheduled_start;
  const end = m.started_at ? m.ended_at : m.scheduled_end;
  if (!start || !end) return null;
  const min = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  return min > 0 ? min : null;
}

/** Palavra para uma nota de critério de 0 a 10. */
export function criterionWord(score: number): string {
  if (score >= 9) return "Excelente";
  if (score >= 7) return "Bom";
  if (score >= 4) return "Regular";
  return "Fraco";
}

const PAST_LABEL = (days: number): { id: string; label: string } => {
  if (days <= 0) return { id: "today", label: "Hoje" };
  if (days === 1) return { id: "yesterday", label: "Ontem" };
  if (days < 7) return { id: "week", label: "Nesta semana" };
  if (days < 14) return { id: "last-week", label: "Semana passada" };
  return { id: "older", label: "Mais antigas" };
};

/**
 * Agrupa como a pessoa pensa o dia: o que está acontecendo agora, o que vem pela frente
 * (mais perto primeiro) e o que já passou, do mais recente para o mais antigo.
 */
export function groupMeetings<T extends MeetingLike>(
  list: T[],
  now = new Date(),
): MeetingGroup<T>[] {
  const live = list.filter((m) => m.status === "live");
  const upcoming = list
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => meetingWhen(a).localeCompare(meetingWhen(b)));
  const past = list
    .filter((m) => m.status !== "live" && m.status !== "scheduled")
    .sort((a, b) => meetingWhen(b).localeCompare(meetingWhen(a)));

  const groups: MeetingGroup<T>[] = [];
  if (live.length) groups.push({ id: "live", label: "Agora", items: live });
  if (upcoming.length) groups.push({ id: "upcoming", label: "Próximas", items: upcoming });
  const today = startOfDay(now);
  for (const m of past) {
    const days = differenceInCalendarDays(today, startOfDay(new Date(meetingWhen(m))));
    const { id, label } = PAST_LABEL(days);
    const last = groups[groups.length - 1];
    if (last && last.id === id) last.items.push(m);
    else groups.push({ id, label, items: [m] });
  }
  return groups;
}
