// Agenda nos dois sentidos, parte com rede e banco. A decisão (o que criar, atualizar, apagar,
// remarcar ou cancelar) está em ./sync.ts, testada sem rede.
import { HttpError, admin } from "@/backend/http.server";
import { meetingUrl } from "@/backend/meetings.server";

import { accessToken, markError, pushEvent, type Connection } from "./oauth.server";
import {
  applyAction,
  matchChanges,
  meetingSyncHash,
  normalizeGoogleEvent,
  normalizeGraphEvent,
  parseLinks,
  planPush,
  upsertLink,
  type ExternalChange,
  type ExternalLink,
  type MatchedChange,
  type MeetingSnapshot,
} from "./sync";

const GOOGLE_EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_PAGES = 20;
/** Janela da primeira leitura (o delta do Graph só acompanha eventos dentro dela). */
const WINDOW_PAST_MS = 24 * 3600_000;
const WINDOW_FUTURE_MS = 180 * 24 * 3600_000;

/**
 * Autorização recusada derruba a conexão (o vendedor precisa reconectar); erro passageiro
 * (rede, 5xx, limite) só fica anotado, para não desligar a agenda por um soluço.
 */
async function noteError(c: Connection, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    (err instanceof HttpError && err.code === "oauth") ||
    /autoriza/i.test(msg) ||
    / 401$/.test(msg)
  )
    return markError(c, err);
  await admin()
    .from("calendar_connections")
    .update({ last_error: msg.slice(0, 300) })
    .eq("id", c.id);
}

// ── Nexus → agenda ──────────────────────────────────────────────────────────────

interface PushMeeting extends MeetingSnapshot {
  account_id: string;
  title: string;
  host_user_id: string | null;
  contact_id: string | null;
}

async function patchEvent(c: Connection, id: string, m: PushMeeting): Promise<void> {
  const token = await accessToken(c);
  const start = new Date(m.scheduled_start!).toISOString();
  const end = new Date(m.scheduled_end!).toISOString();
  const res =
    c.provider === "google"
      ? await fetch(`${GOOGLE_EVENTS}/${encodeURIComponent(id)}?sendUpdates=none`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            summary: m.title,
            start: { dateTime: start },
            end: { dateTime: end },
          }),
          signal: AbortSignal.timeout(10_000),
        })
      : await fetch(`${GRAPH}/me/events/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            subject: m.title,
            start: { dateTime: start.replace(/Z$/, ""), timeZone: "UTC" },
            end: { dateTime: end.replace(/Z$/, ""), timeZone: "UTC" },
          }),
          signal: AbortSignal.timeout(10_000),
        });
  if (!res.ok) throw new Error(`${c.provider} atualizar evento ${res.status}`);
}

async function deleteEvent(c: Connection, id: string): Promise<void> {
  const token = await accessToken(c);
  const url =
    c.provider === "google"
      ? `${GOOGLE_EVENTS}/${encodeURIComponent(id)}?sendUpdates=none`
      : `${GRAPH}/me/events/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  // já apagado lá: está no estado que queremos
  if (!res.ok && res.status !== 404 && res.status !== 410)
    throw new Error(`${c.provider} apagar evento ${res.status}`);
}

/** Leva a reunião para cada agenda conectada do anfitrião (cria, atualiza ou apaga). */
export async function pushMeeting(meetingId: string): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: m } = await db
    .from("meetings")
    .select(
      "id, account_id, title, host_user_id, scheduled_start, scheduled_end, contact_id, status, external_events",
    )
    .eq("id", meetingId)
    .maybeSingle();
  if (!m?.host_user_id || !m.scheduled_start || !m.scheduled_end)
    return { skipped: "reunião sem anfitrião ou horário" };
  const { data: conns } = await db
    .from("calendar_connections")
    .select("id, account_id, user_id, provider, email")
    .eq("account_id", m.account_id)
    .eq("user_id", m.host_user_id)
    .eq("status", "connected");
  const connections = (conns ?? []) as Connection[];
  if (!connections.length) return { skipped: "anfitrião sem agenda conectada" };
  const meeting = m as unknown as PushMeeting;
  const ops = planPush(
    meeting,
    connections.map((c) => c.id),
  );
  if (!ops.length) return { skipped: "agendas já atualizadas" };

  const hash = meetingSyncHash(meeting);
  let links: ExternalLink[] = parseLinks(meeting.external_events);
  let contactName: string | null = null;
  if (ops.some((o) => o.kind === "create") && meeting.contact_id) {
    const { data: contact } = await db
      .from("contacts")
      .select("name")
      .eq("id", meeting.contact_id)
      .maybeSingle();
    contactName = contact?.name ?? null;
  }
  const done: string[] = [];
  const errors: string[] = [];
  for (const op of ops) {
    const c = connections.find((x) => x.id === op.connectionId)!;
    try {
      if (op.kind === "create") {
        const url = meetingUrl(meeting.id);
        const id = await pushEvent(c, {
          title: meeting.title,
          start: new Date(meeting.scheduled_start!).toISOString(),
          end: new Date(meeting.scheduled_end!).toISOString(),
          description: `Reunião no Nexus One${contactName ? ` com ${contactName}` : ""}.\nSala: ${url}`,
          joinUrl: url,
          attendees: [],
        });
        if (id) links = upsertLink(links, { connection_id: c.id, provider: c.provider, id, hash });
      } else if (op.kind === "update") {
        await patchEvent(c, op.link.id, meeting);
        links = upsertLink(links, { ...op.link, hash });
      } else {
        await deleteEvent(c, op.link.id);
        links = upsertLink(links, { ...op.link, hash });
      }
      done.push(`${op.kind}:${c.provider}`);
      await db
        .from("calendar_connections")
        .update({ last_sync_at: new Date().toISOString(), last_error: null })
        .eq("id", c.id);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      await noteError(c, err);
    }
  }
  // grava só os links (não dispara o gatilho de remarcação: external_events não está na lista dele)
  await db
    .from("meetings")
    .update({ external_events: links as never })
    .eq("id", meeting.id);
  if (errors.length && !done.length) throw new Error(errors.join("; "));
  return { done, errors };
}

// ── agenda → Nexus ──────────────────────────────────────────────────────────────

interface PullResult {
  changes: ExternalChange[];
  cursor: string | null;
}

async function pullGoogle(c: Connection, cursor: string | null): Promise<PullResult> {
  const token = await accessToken(c);
  const changes: ExternalChange[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const q = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
    if (cursor) q.set("syncToken", cursor);
    else q.set("timeMin", new Date(Date.now() - WINDOW_PAST_MS).toISOString());
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${GOOGLE_EVENTS}?${q}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    // 410: syncToken venceu; recomeça pela leitura completa
    if (res.status === 410 && cursor) return pullGoogle(c, null);
    if (!res.ok) throw new Error(`Google events.list ${res.status}`);
    const j = (await res.json()) as {
      items?: unknown[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    for (const it of j.items ?? []) {
      const ch = normalizeGoogleEvent(it);
      if (ch) changes.push(ch);
    }
    if (j.nextSyncToken) return { changes, cursor: j.nextSyncToken };
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  // sem syncToken depois do teto de páginas: processa o que veio e recomeça na próxima rodada
  return { changes, cursor };
}

function isGraphUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.host === "graph.microsoft.com";
  } catch {
    return false;
  }
}

async function pullGraph(c: Connection, cursor: string | null): Promise<PullResult> {
  const token = await accessToken(c);
  const changes: ExternalChange[] = [];
  const now = Date.now();
  let url =
    cursor && isGraphUrl(cursor)
      ? cursor
      : `${GRAPH}/me/calendarView/delta?startDateTime=${new Date(now - WINDOW_PAST_MS).toISOString()}&endDateTime=${new Date(now + WINDOW_FUTURE_MS).toISOString()}`;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        prefer: 'outlook.timezone="UTC", odata.maxpagesize=100',
      },
      signal: AbortSignal.timeout(15_000),
    });
    // deltaLink vencido (410 / syncStateNotFound): recomeça
    if ((res.status === 410 || res.status === 404) && cursor) return pullGraph(c, null);
    if (!res.ok) throw new Error(`Graph calendarView/delta ${res.status}`);
    const j = (await res.json()) as {
      value?: unknown[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };
    for (const it of j.value ?? []) {
      const ch = normalizeGraphEvent(it);
      if (ch) changes.push(ch);
    }
    const delta = j["@odata.deltaLink"];
    if (delta && isGraphUrl(delta)) return { changes, cursor: delta };
    const next = j["@odata.nextLink"];
    if (!next || !isGraphUrl(next)) break;
    url = next;
  }
  // parou no teto: continua da próxima página na rodada seguinte
  return { changes, cursor: url };
}

async function applyMatched(c: Connection, list: MatchedChange[]): Promise<void> {
  const db = admin();
  for (const { meeting, action } of list) {
    const after = applyAction(meeting, action);
    // a agenda de origem já está no estado novo: o calendar.push que o gatilho enfileira não volta nela
    const links = parseLinks(meeting.external_events).map((l) =>
      l.connection_id === c.id ? { ...l, hash: meetingSyncHash(after) } : l,
    );
    const { data: full } = await db
      .from("meetings")
      .select("event_id, title, reschedule_count")
      .eq("id", meeting.id)
      .single();
    if (action.kind === "cancel") {
      await db
        .from("meetings")
        .update({
          status: "canceled",
          canceled_by: "calendar",
          cancel_reason: `Cancelada na agenda ${c.provider === "google" ? "do Google" : "do Outlook"}`,
          external_events: links as never,
        })
        .eq("id", meeting.id)
        .eq("status", "scheduled");
      if (full?.event_id)
        await db.from("events").update({ status: "canceled" }).eq("id", full.event_id);
      await db
        .from("jobs")
        .update({ status: "canceled" })
        .eq("status", "queued")
        .eq("kind", "meeting.reminder")
        .contains("payload", { meeting_id: meeting.id });
    } else {
      await db
        .from("meetings")
        .update({
          scheduled_start: action.start,
          scheduled_end: action.end,
          reschedule_count: (full?.reschedule_count ?? 0) + 1,
          external_events: links as never,
        })
        .eq("id", meeting.id)
        .eq("status", "scheduled");
      if (full?.event_id)
        await db
          .from("events")
          .update({ starts_at: action.start, ends_at: action.end })
          .eq("id", full.event_id);
    }
    const when = action.kind === "move" ? formatWhen(action.start) : null;
    await db.rpc("notify_user", {
      _account: c.account_id,
      _user: c.user_id,
      _kind: "meeting_calendar",
      _title:
        action.kind === "cancel"
          ? `Reunião cancelada pela sua agenda: ${full?.title ?? "reunião"}`
          : `Reunião remarcada pela sua agenda: ${full?.title ?? "reunião"}`,
      _body:
        action.kind === "cancel"
          ? "O evento foi apagado ou cancelado na sua agenda, então a reunião foi cancelada no Nexus. Avise o cliente se for o caso."
          : `Novo horário: ${when}. Os lembretes antigos continuam valendo; confira se o cliente sabe da mudança.`,
      _link: `/reunioes/${meeting.id}`,
    });
  }
}

function formatWhen(isoValue: string): string {
  return new Date(isoValue).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Lê o que mudou numa agenda conectada e reflete nas reuniões nossas que estão nela. */
export async function pullConnection(connectionId: string): Promise<Record<string, unknown>> {
  const db = admin();
  const { data: row } = await db
    .from("calendar_connections")
    .select("id, account_id, user_id, provider, email, status, sync_cursor")
    .eq("id", connectionId)
    .maybeSingle();
  if (!row || row.status !== "connected") return { skipped: "conexão inativa" };
  const c = row as unknown as Connection & { sync_cursor: string | null };
  try {
    const pulled =
      c.provider === "google"
        ? await pullGoogle(c, c.sync_cursor)
        : await pullGraph(c, c.sync_cursor);
    let applied = 0;
    if (pulled.changes.length) {
      const { data: meetings } = await db
        .from("meetings")
        .select("id, status, scheduled_start, scheduled_end, external_events")
        .eq("account_id", c.account_id)
        .eq("host_user_id", c.user_id)
        .eq("status", "scheduled")
        .neq("external_events", "[]")
        .gte("scheduled_end", new Date(Date.now() - WINDOW_PAST_MS).toISOString())
        .limit(1000);
      const matched = matchChanges((meetings ?? []) as MeetingSnapshot[], pulled.changes, c.id);
      await applyMatched(c, matched);
      applied = matched.length;
    }
    await db
      .from("calendar_connections")
      .update({ sync_cursor: pulled.cursor, last_error: null })
      .eq("id", c.id);
    return { changes: pulled.changes.length, applied };
  } catch (err) {
    await noteError(c, err);
    throw err;
  }
}
