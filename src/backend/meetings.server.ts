import { BRAND } from "@/lib/brand";
// Reuniões (Meet próprio em LiveKit): criação, convites, tokens e contexto do agente.
import { createHash, randomBytes } from "node:crypto";

import { HttpError, admin, appBaseUrl } from "@/backend/http.server";
import { getIntegration } from "@/backend/integrations.server";
import type { LiveKitCreds } from "@/backend/providers/livekit.server";
import { manageExpiry, signManageToken, verifyManageToken } from "@/backend/meetings/manage-link";
import { parsePlaybook, type PlaybookContent } from "@/features/playbooks/types";
import { TEMPLATE_PLAYBOOK } from "@/features/playbooks/template";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

export function roomNameFor(meetingId: string): string {
  return `nx-${meetingId.replace(/-/g, "").slice(0, 20)}`;
}

export function meetingUrl(meetingId: string, guestToken?: string): string {
  const base = appBaseUrl();
  return guestToken ? `${base}/sala/${meetingId}?t=${guestToken}` : `${base}/sala/${meetingId}`;
}

export async function livekitCreds(accountId: string): Promise<LiveKitCreds | null> {
  const it = await getIntegration(accountId, "livekit");
  const url = it?.config["url"];
  const apiKey = it?.config["api_key"];
  const apiSecret = it?.secrets["api_secret"];
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export async function requireLivekit(accountId: string): Promise<LiveKitCreds> {
  const c = await livekitCreds(accountId);
  if (!c)
    throw new HttpError(
      409,
      "A sala de reunião ainda não está ligada. Um administrador precisa conectar o LiveKit em Ajustes › Integrações.",
      "livekit_not_configured",
    );
  return c;
}

export interface CreateMeetingInput {
  accountId: string;
  title: string;
  hostUserId: string | null;
  contactId?: string | null;
  dealId?: string | null;
  eventId?: string | null;
  bookingPageId?: string | null;
  playbookId?: string | null;
  start: Date;
  end: Date;
  answers?: Record<string, unknown>;
  createdBy?: string | null;
  createEvent?: boolean;
  requireAdmit?: boolean;
}

/** Cria a reunião, o evento da agenda (se pedido) e os participantes; devolve o token do convidado. */
export async function createMeeting(input: CreateMeetingInput) {
  const db = admin();
  const id = crypto.randomUUID();
  let eventId = input.eventId ?? null;
  if (!eventId && input.createEvent !== false) {
    const { data: ev, error } = await db
      .from("events")
      .insert({
        account_id: input.accountId,
        title: input.title.slice(0, 160),
        starts_at: input.start.toISOString(),
        ends_at: input.end.toISOString(),
        meeting_url: meetingUrl(id),
        location: `Sala ${BRAND.name}`,
        contact_id: input.contactId ?? null,
        deal_id: input.dealId ?? null,
        owner_user_id: input.hostUserId,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) throw new HttpError(500, `Não deu para criar o evento: ${error.message}`, "event");
    eventId = ev.id;
  } else if (eventId) {
    await db
      .from("events")
      .update({ meeting_url: meetingUrl(id) })
      .eq("id", eventId);
  }
  const playbookId =
    input.playbookId ?? (await defaultPlaybookId(input.accountId, input.dealId ?? null));
  const { data: meeting, error } = await db
    .from("meetings")
    .insert({
      id,
      account_id: input.accountId,
      event_id: eventId,
      booking_page_id: input.bookingPageId ?? null,
      room_name: roomNameFor(id),
      title: input.title.slice(0, 160),
      host_user_id: input.hostUserId,
      contact_id: input.contactId ?? null,
      deal_id: input.dealId ?? null,
      playbook_id: playbookId,
      scheduled_start: input.start.toISOString(),
      scheduled_end: input.end.toISOString(),
      booking_answers: (input.answers ?? {}) as never,
      require_admit: input.requireAdmit ?? false,
      created_by: input.createdBy ?? input.hostUserId,
    })
    .select("*")
    .single();
  if (error) throw new HttpError(500, `Não deu para criar a reunião: ${error.message}`, "meeting");

  if (input.hostUserId) {
    await db.from("meeting_participants").insert({
      account_id: input.accountId,
      meeting_id: id,
      kind: "host",
      user_id: input.hostUserId,
      identity: `user-${input.hostUserId}`,
    });
  }
  // grava na agenda pessoal do anfitrião (Google/Outlook) quando ele conectou; sem conexão, o job pula
  if (input.hostUserId)
    await db.rpc("enqueue_job", {
      _account: input.accountId,
      _kind: "calendar.push",
      _payload: { meeting_id: id },
      _dedupe: `calendar:${id}`,
    });
  if (input.hostUserId) await scheduleBriefing(input.accountId, id, input.start);
  let guestToken: string | null = null;
  if (input.contactId) guestToken = await issueContactToken(input.accountId, id, input.contactId);
  await db.rpc("emit_event", {
    _account: input.accountId,
    _type: "meeting.scheduled",
    _entity: "meeting",
    _entity_id: id,
    _payload: {
      contact_id: input.contactId ?? null,
      starts_at: input.start.toISOString(),
      host_user_id: input.hostUserId,
    },
  });
  return { meeting, guestToken, eventId };
}

/** Gera (ou troca) o token do convidado-contato. O texto só existe em memória; no banco fica o hash. */
export async function issueContactToken(
  accountId: string,
  meetingId: string,
  contactId: string,
): Promise<string> {
  const db = admin();
  const raw = newToken();
  const { data: c } = await db
    .from("contacts")
    .select("name, email")
    .eq("id", contactId)
    .maybeSingle();
  const { data: m } = await db
    .from("meetings")
    .select("scheduled_end, require_admit")
    .eq("id", meetingId)
    .maybeSingle();
  const expires = new Date(
    Math.max(Date.now(), new Date(m?.scheduled_end ?? Date.now()).getTime()) + 7 * 86_400_000,
  );
  const { error } = await db.from("meeting_participants").upsert(
    {
      account_id: accountId,
      meeting_id: meetingId,
      kind: "contact",
      contact_id: contactId,
      name: c?.name ?? null,
      email: c?.email ?? null,
      identity: `contact-${contactId}`,
      token_hash: hashToken(raw),
      token_expires_at: expires.toISOString(),
      admitted: !m?.require_admit,
    },
    { onConflict: "meeting_id,identity" },
  );
  if (error) throw new HttpError(500, `Convite: ${error.message}`, "participant");
  return raw;
}

export async function enqueueInviteAndReminders(accountId: string, meetingId: string, start: Date) {
  const db = admin();
  await db.rpc("enqueue_job", {
    _account: accountId,
    _kind: "meeting.invite",
    _payload: { meeting_id: meetingId },
    _dedupe: `meeting.invite:${meetingId}`,
  });
  await enqueueReminders(accountId, meetingId, start);
}

/** Lembretes de 24 h (com "Confirmo presença") e de 1 h; a chave inclui o horário (remarcar gera novos). */
export async function enqueueReminders(accountId: string, meetingId: string, start: Date) {
  const db = admin();
  const at = start.toISOString();
  const day = start.getTime() - 24 * 3600_000;
  const hour = start.getTime() - 3600_000;
  if (day > Date.now() + 10 * 60_000)
    await db.rpc("enqueue_job", {
      _account: accountId,
      _kind: "meeting.reminder",
      _payload: { meeting_id: meetingId, kind: "24h", start: at },
      _run_at: new Date(day).toISOString(),
      _dedupe: `meeting.reminder:${meetingId}:24h:${at}`,
    });
  if (hour > Date.now() + 5 * 60_000)
    await db.rpc("enqueue_job", {
      _account: accountId,
      _kind: "meeting.reminder",
      _payload: { meeting_id: meetingId, kind: "1h", start: at },
      _run_at: new Date(hour).toISOString(),
      _dedupe: `meeting.reminder:${meetingId}:1h:${at}`,
    });
}

/** Briefing da IA 30 min antes (ou já, se faltar menos que isso). */
export async function scheduleBriefing(accountId: string, meetingId: string, start: Date) {
  if (start.getTime() <= Date.now()) return;
  const runAt = Math.max(Date.now(), start.getTime() - 30 * 60_000);
  await admin().rpc("enqueue_job", {
    _account: accountId,
    _kind: "meeting.briefing",
    _payload: { meeting_id: meetingId },
    _run_at: new Date(runAt).toISOString(),
    _dedupe: `meeting.briefing:${meetingId}`,
  });
}

/** Cancela lembretes e briefing ainda na fila (reunião cancelada ou remarcada). */
export async function cancelQueuedMeetingJobs(meetingId: string) {
  await admin()
    .from("jobs")
    .update({ status: "canceled" })
    .eq("status", "queued")
    .in("kind", ["meeting.reminder", "meeting.briefing"])
    .contains("payload", { meeting_id: meetingId });
}

let manageSecret: string | null = null;
/** Link público para o convidado confirmar, remarcar ou cancelar (assinado, sem login). */
export async function manageUrl(meetingId: string, scheduledEnd: string | null): Promise<string> {
  if (!manageSecret) {
    const { data, error } = await admin().rpc("email_link_secret");
    if (error || !data) throw new HttpError(503, "Segredo indisponível", "secret");
    manageSecret = data as string;
  }
  const token = signManageToken({ meetingId, exp: manageExpiry(scheduledEnd) }, manageSecret);
  return `${appBaseUrl()}/reuniao/${token}`;
}

export async function verifyManage(token: string) {
  if (!manageSecret) {
    const { data } = await admin().rpc("email_link_secret");
    manageSecret = typeof data === "string" ? data : null;
  }
  return manageSecret ? verifyManageToken(token, manageSecret) : null;
}

/** Aceite de gravação ao entrar na sala, com prova (IP com hash, navegador, horário, aviso lido). */
export async function recordJoinConsent(o: {
  accountId: string;
  contactId: string;
  meetingId: string;
  notice: string;
  ipHash: string | null;
  userAgent: string | null;
}) {
  const db = admin();
  // uma prova por reunião basta: reentrar na sala não duplica
  const { data: existing } = await db
    .from("consents")
    .select("id")
    .eq("contact_id", o.contactId)
    .eq("channel", "meeting_recording")
    .eq("status", "granted")
    .contains("proof", { meeting_id: o.meetingId })
    .limit(1)
    .maybeSingle();
  if (existing) return;
  const { error } = await db.from("consents").insert({
    account_id: o.accountId,
    contact_id: o.contactId,
    channel: "meeting_recording",
    status: "granted",
    basis: "consent",
    source: "sala",
    proof: {
      meeting_id: o.meetingId,
      ip_hash: o.ipHash,
      ua: (o.userAgent ?? "").slice(0, 200),
      notice: o.notice.slice(0, 500),
      at: new Date().toISOString(),
    },
  });
  if (error) console.error("[meetings] aceite de gravação não gravou", error.message);
}

/** Playbook da reunião: o da etapa do negócio, senão o padrão da conta, senão o modelo. */
export async function defaultPlaybookId(
  accountId: string,
  dealId: string | null,
): Promise<string | null> {
  const db = admin();
  if (dealId) {
    const { data: deal } = await db
      .from("deals")
      .select("stage_id, pipeline_id")
      .eq("id", dealId)
      .maybeSingle();
    if (deal) {
      const { data: byStage } = await db
        .from("playbooks")
        .select("id")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .eq("stage_id", deal.stage_id)
        .limit(1)
        .maybeSingle();
      if (byStage) return byStage.id;
      const { data: byPipe } = await db
        .from("playbooks")
        .select("id")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .eq("pipeline_id", deal.pipeline_id)
        .is("stage_id", null)
        .limit(1)
        .maybeSingle();
      if (byPipe) return byPipe.id;
    }
  }
  const { data } = await db
    .from("playbooks")
    .select("id")
    .eq("account_id", accountId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function loadPlaybook(playbookId: string | null): Promise<PlaybookContent> {
  if (!playbookId) return TEMPLATE_PLAYBOOK;
  const { data } = await admin().from("playbooks").select("*").eq("id", playbookId).maybeSingle();
  return data ? parsePlaybook(data as unknown as Record<string, unknown>) : TEMPLATE_PLAYBOOK;
}

export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Convite de calendário (.ics) para o contato adicionar na própria agenda. */
export function buildIcs(o: {
  uid: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
  url: string;
  organizer: string;
  method?: "REQUEST" | "CANCEL";
}): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${BRAND.slug}//Reunioes//PT-BR`,
    "CALSCALE:GREGORIAN",
    `METHOD:${o.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${o.uid}@${BRAND.slug}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(o.start)}`,
    `DTEND:${icsDate(o.end)}`,
    `SUMMARY:${icsEscape(o.title)}`,
    `DESCRIPTION:${icsEscape(`${o.description}\n\nEntrar: ${o.url}`)}`,
    `LOCATION:${icsEscape(o.url)}`,
    `URL:${o.url}`,
    `ORGANIZER;CN=${icsEscape(o.organizer)}:mailto:no-reply@${BRAND.slug}.invalid`,
    o.method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reunião em 15 minutos",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

let agentSecret: string | null = null;
/** O worker do livecoach se autentica com x-agent-secret (Vault: platform:agent_secret). */
export async function requireAgent(req: Request): Promise<void> {
  const got = req.headers.get("x-agent-secret") ?? "";
  if (!agentSecret) {
    const { data } = await admin().rpc("agent_secret");
    agentSecret = typeof data === "string" ? data : null;
  }
  const { safeEqual } = await import("@/backend/http.server");
  if (!agentSecret || !got || !safeEqual(got, agentSecret))
    throw new HttpError(401, "Agente não autorizado", "unauthorized");
}

export async function meetingByRoom(room: string) {
  const { data } = await admin().from("meetings").select("*").eq("room_name", room).maybeSingle();
  if (!data) throw new HttpError(404, "Reunião não encontrada", "not_found");
  return data;
}

export function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
