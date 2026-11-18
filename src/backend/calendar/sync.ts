// Agenda nos dois sentidos, parte pura (sem rede nem banco).
// - Vínculo → agenda: o que fazer com o evento externo de cada agenda conectada (criar, atualizar, apagar).
// - Agenda → Vínculo: o que uma mudança externa (Google events.list / Graph calendarView delta)
//   significa para a reunião nossa que gerou aquele evento (remarcar, cancelar ou nada).
import type { CalendarProvider } from "./state";

/** Item de meetings.external_events: o evento que gravamos numa agenda e o estado que ela já tem. */
export interface ExternalLink {
  connection_id: string;
  provider: CalendarProvider;
  id: string;
  hash: string | null;
}

/** Mudança vinda da agenda externa, já no formato comum. */
export interface ExternalChange {
  id: string;
  canceled: boolean;
  start: string | null;
  end: string | null;
}

export interface MeetingSnapshot {
  id: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  external_events: unknown;
}

export type MeetingAction =
  { kind: "cancel" } | { kind: "move"; start: string; end: string } | { kind: "none" };

export type PushOp =
  | { kind: "create"; connectionId: string }
  | { kind: "update"; connectionId: string; link: ExternalLink }
  | { kind: "delete"; connectionId: string; link: ExternalLink };

/** Diferença menor que isto é arredondamento de agenda, não remarcação. */
const SAME_TIME_MS = 60_000;

const iso = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** Estado que a agenda externa precisa refletir. Muda quando a reunião é remarcada ou cancelada. */
export function meetingSyncHash(m: {
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
}): string {
  return `${m.status === "canceled" ? "x" : "s"}|${iso(m.scheduled_start) ?? ""}|${iso(m.scheduled_end) ?? ""}`;
}

export function parseLinks(v: unknown): ExternalLink[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    if (typeof o["connection_id"] !== "string" || typeof o["id"] !== "string" || !o["id"])
      return [];
    const provider = o["provider"] === "microsoft" ? "microsoft" : "google";
    return [
      {
        connection_id: o["connection_id"],
        provider,
        id: o["id"],
        hash: typeof o["hash"] === "string" ? o["hash"] : null,
      } satisfies ExternalLink,
    ];
  });
}

/** Troca (ou acrescenta) o link de uma conexão, sem mexer nos outros. */
export function upsertLink(links: readonly ExternalLink[], link: ExternalLink): ExternalLink[] {
  return [...links.filter((l) => l.connection_id !== link.connection_id), link];
}

// ── agenda → Vínculo ──────────────────────────────────────────────────────────────

/** Evento do Google Agenda (events.list). Dia inteiro não tem horário: fica sem início/fim. */
export function normalizeGoogleEvent(e: unknown): ExternalChange | null {
  const o = (e ?? {}) as {
    id?: unknown;
    status?: unknown;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
  };
  if (typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    canceled: o.status === "cancelled",
    start: iso(o.start?.dateTime),
    end: iso(o.end?.dateTime),
  };
}

/** Horário do Graph pedido em UTC (Prefer: outlook.timezone="UTC") vem sem o "Z". */
function graphTime(t: { dateTime?: string; timeZone?: string } | undefined): string | null {
  const v = t?.dateTime;
  if (!v) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(v);
  if (!hasZone && t?.timeZone && t.timeZone !== "UTC") return null; // fuso que não pedimos: ignora
  return iso(hasZone ? v : `${v}Z`);
}

/** Evento do Microsoft Graph (calendarView/delta). Apagado vem com "@removed". */
export function normalizeGraphEvent(e: unknown): ExternalChange | null {
  const o = (e ?? {}) as {
    id?: unknown;
    isCancelled?: unknown;
    "@removed"?: unknown;
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
  };
  if (typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    canceled: Boolean(o["@removed"]) || o.isCancelled === true,
    start: graphTime(o.start),
    end: graphTime(o.end),
  };
}

/** O que a mudança externa faz com a reunião. Só reunião ainda agendada se mexe. */
export function planChange(meeting: MeetingSnapshot, change: ExternalChange): MeetingAction {
  if (meeting.status !== "scheduled") return { kind: "none" };
  if (change.canceled) return { kind: "cancel" };
  if (!change.start || !change.end) return { kind: "none" };
  const start = Date.parse(change.start);
  const end = Date.parse(change.end);
  if (!(end > start)) return { kind: "none" };
  const curStart = meeting.scheduled_start ? Date.parse(meeting.scheduled_start) : NaN;
  const curEnd = meeting.scheduled_end ? Date.parse(meeting.scheduled_end) : NaN;
  if (Math.abs(start - curStart) < SAME_TIME_MS && Math.abs(end - curEnd) < SAME_TIME_MS)
    return { kind: "none" };
  return { kind: "move", start: change.start, end: change.end };
}

export interface MatchedChange {
  meeting: MeetingSnapshot;
  change: ExternalChange;
  action: Exclude<MeetingAction, { kind: "none" }>;
}

/**
 * Cruza as mudanças de uma conexão com as reuniões que gravamos nela. Mudança de evento que não é
 * nosso é ignorada; várias mudanças do mesmo evento valem pela última.
 */
export function matchChanges(
  meetings: readonly MeetingSnapshot[],
  changes: readonly ExternalChange[],
  connectionId: string,
): MatchedChange[] {
  const byExternal = new Map<string, MeetingSnapshot>();
  for (const m of meetings)
    for (const l of parseLinks(m.external_events))
      if (l.connection_id === connectionId) byExternal.set(l.id, m);
  const last = new Map<string, ExternalChange>();
  for (const c of changes) if (byExternal.has(c.id)) last.set(c.id, c);
  const out: MatchedChange[] = [];
  for (const [id, change] of last) {
    const meeting = byExternal.get(id)!;
    const action = planChange(meeting, change);
    if (action.kind !== "none") out.push({ meeting, change, action });
  }
  return out;
}

/** Reunião depois de aplicar a mudança externa (para o hash do link de origem). */
export function applyAction(meeting: MeetingSnapshot, action: MatchedChange["action"]) {
  return action.kind === "cancel"
    ? { ...meeting, status: "canceled" }
    : { ...meeting, scheduled_start: action.start, scheduled_end: action.end };
}

// ── Vínculo → agenda ──────────────────────────────────────────────────────────────

/** Para cada agenda conectada do anfitrião: criar, atualizar, apagar ou nada. */
export function planPush(meeting: MeetingSnapshot, connectionIds: readonly string[]): PushOp[] {
  const links = parseLinks(meeting.external_events);
  const want = meetingSyncHash(meeting);
  const canceled = meeting.status === "canceled";
  const ops: PushOp[] = [];
  for (const connectionId of connectionIds) {
    const link = links.find((l) => l.connection_id === connectionId);
    if (link && link.hash === want) continue;
    if (canceled) {
      if (link) ops.push({ kind: "delete", connectionId, link });
      continue;
    }
    if (meeting.status !== "scheduled") continue; // ao vivo ou encerrada: a agenda já serviu
    ops.push(link ? { kind: "update", connectionId, link } : { kind: "create", connectionId });
  }
  return ops;
}
