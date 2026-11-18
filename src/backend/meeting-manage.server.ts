// Autoatendimento do convidado pelo link assinado: ver a reunião, confirmar presença,
// cancelar ou escolher outro horário entre os livres do anfitrião.
import { assertRescheduleSlot, rescheduleSlots } from "@/backend/booking.server";
import { HttpError, admin } from "@/backend/http.server";
import { guestActions } from "@/backend/meetings/manage-link";
import {
  cancelQueuedMeetingJobs,
  enqueueReminders,
  formatWhen,
  scheduleBriefing,
  verifyManage,
} from "@/backend/meetings.server";

type MeetingRow = NonNullable<Awaited<ReturnType<typeof loadByToken>>>["meeting"];

export async function loadByToken(token: string) {
  const claim = await verifyManage(token);
  if (!claim)
    throw new HttpError(
      403,
      "Este link não vale mais. Peça um novo a quem te convidou.",
      "bad_link",
    );
  const db = admin();
  const { data: meeting } = await db
    .from("meetings")
    .select("*")
    .eq("id", claim.meetingId)
    .maybeSingle();
  if (!meeting) throw new HttpError(404, "Reunião não encontrada", "not_found");
  const [{ data: account }, { data: host }] = await Promise.all([
    db.from("accounts").select("name, timezone").eq("id", meeting.account_id).single(),
    meeting.host_user_id
      ? db.from("profiles").select("full_name").eq("id", meeting.host_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    meeting,
    accountName: account?.name ?? "",
    timeZone: account?.timezone || "America/Sao_Paulo",
    hostName: host?.full_name ?? null,
  };
}

export async function manageInfo(token: string, withSlots: boolean) {
  const ctx = await loadByToken(token);
  const m = ctx.meeting;
  const actions = guestActions(m);
  const slots =
    withSlots && actions.canReschedule ? (await rescheduleSlots(m)).slots.slice(0, 120) : [];
  return {
    title: m.title,
    status: m.status,
    scheduled_start: m.scheduled_start,
    scheduled_end: m.scheduled_end,
    confirmed: Boolean(m.guest_confirmed_at),
    account_name: ctx.accountName,
    host_name: ctx.hostName,
    time_zone: ctx.timeZone,
    actions,
    slots,
  };
}

async function tellHost(m: MeetingRow, title: string, body: string) {
  if (!m.host_user_id) return;
  await admin().rpc("notify_user", {
    _account: m.account_id,
    _user: m.host_user_id,
    _kind: "meeting_guest",
    _title: title,
    _body: body,
    _link: `/reunioes/${m.id}`,
  });
}

async function contactName(m: MeetingRow): Promise<string> {
  if (!m.contact_id) return "O convidado";
  const { data } = await admin()
    .from("contacts")
    .select("name")
    .eq("id", m.contact_id)
    .maybeSingle();
  return data?.name ?? "O convidado";
}

export async function confirmPresence(token: string) {
  const { meeting: m, timeZone } = await loadByToken(token);
  if (m.guest_confirmed_at) return { ok: true, already: true };
  if (!guestActions(m).canConfirm)
    throw new HttpError(409, "Esta reunião não pode mais ser confirmada.", "not_allowed");
  const db = admin();
  const now = new Date().toISOString();
  await db.from("meetings").update({ guest_confirmed_at: now }).eq("id", m.id);
  if (m.event_id)
    await db
      .from("events")
      .update({ status: "confirmed" })
      .eq("id", m.event_id)
      .eq("status", "scheduled");
  await db.rpc("emit_event", {
    _account: m.account_id,
    _type: "meeting.confirmed",
    _entity: "meeting",
    _entity_id: m.id,
    _payload: { contact_id: m.contact_id },
  });
  await tellHost(
    m,
    `${await contactName(m)} confirmou presença`,
    `${m.title} · ${formatWhen(m.scheduled_start ?? now, timeZone)}`,
  );
  return { ok: true, already: false };
}

export async function cancelByGuest(token: string, reason: string | null) {
  const { meeting: m, timeZone } = await loadByToken(token);
  if (m.status === "canceled") return { ok: true, already: true };
  if (!guestActions(m).canCancel)
    throw new HttpError(409, "Esta reunião não pode mais ser cancelada por aqui.", "not_allowed");
  const db = admin();
  const why = reason?.trim().slice(0, 500) || null;
  await db
    .from("meetings")
    .update({ status: "canceled", canceled_by: "contact", cancel_reason: why })
    .eq("id", m.id);
  if (m.event_id) await db.from("events").update({ status: "canceled" }).eq("id", m.event_id);
  await cancelQueuedMeetingJobs(m.id);
  await db.rpc("emit_event", {
    _account: m.account_id,
    _type: "meeting.canceled",
    _entity: "meeting",
    _entity_id: m.id,
    _payload: { contact_id: m.contact_id, by: "contact", reason: why },
  });
  await tellHost(
    m,
    `${await contactName(m)} cancelou a reunião`,
    `${formatWhen(m.scheduled_start ?? new Date().toISOString(), timeZone)}${why ? ` · Motivo: ${why}` : ""}`,
  );
  return { ok: true, already: false };
}

export async function rescheduleByGuest(token: string, startIso: string) {
  const { meeting: m, timeZone } = await loadByToken(token);
  if (!guestActions(m).canReschedule)
    throw new HttpError(409, "Esta reunião não pode mais ser remarcada por aqui.", "not_allowed");
  const { start, end } = await assertRescheduleSlot(m, startIso);
  const db = admin();
  const before = m.scheduled_start;
  const { data: updated } = await db
    .from("meetings")
    .update({
      status: "scheduled",
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      started_at: null,
      ended_at: null,
      egress_id: null,
      guest_confirmed_at: null,
      briefing: null,
      briefing_at: null,
      reschedule_count: (m.reschedule_count ?? 0) + 1,
    })
    .eq("id", m.id)
    // trava otimista: dois cliques ou duas abas não remarcam duas vezes
    .eq("reschedule_count", m.reschedule_count ?? 0)
    .select("id")
    .maybeSingle();
  if (!updated)
    throw new HttpError(409, "A reunião acabou de mudar. Recarregue a página.", "stale");
  if (m.event_id)
    await db
      .from("events")
      .update({ starts_at: start.toISOString(), ends_at: end.toISOString(), status: "scheduled" })
      .eq("id", m.event_id);
  await db
    .from("meeting_participants")
    .update({ joined_at: null, left_at: null })
    .eq("meeting_id", m.id)
    .eq("kind", "contact");
  await cancelQueuedMeetingJobs(m.id);
  // novo convite com o horário novo, lembretes e briefing de novo
  await db.rpc("enqueue_job", {
    _account: m.account_id,
    _kind: "meeting.invite",
    _payload: { meeting_id: m.id, rescheduled: true },
    _dedupe: `meeting.invite:${m.id}:${start.toISOString()}`,
  });
  await enqueueReminders(m.account_id, m.id, start);
  if (m.host_user_id) await scheduleBriefing(m.account_id, m.id, start);
  await db.rpc("emit_event", {
    _account: m.account_id,
    _type: "meeting.rescheduled",
    _entity: "meeting",
    _entity_id: m.id,
    _payload: {
      contact_id: m.contact_id,
      from: before,
      starts_at: start.toISOString(),
      by: "contact",
      after_no_show: m.status === "no_show",
    },
  });
  await tellHost(
    m,
    `${await contactName(m)} remarcou a reunião`,
    `Novo horário: ${formatWhen(start.toISOString(), timeZone)}`,
  );
  return { ok: true, start: start.toISOString(), end: end.toISOString(), time_zone: timeZone };
}
