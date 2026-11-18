// Agendamento público: horários livres (agenda real do dono ou do rodízio) e reserva.
import { escapeLike, publicBookingJoinUrl } from "@/backend/contact-trust";
import { HttpError, admin } from "@/backend/http.server";
import { createMeeting, enqueueInviteAndReminders } from "@/backend/meetings.server";
import {
  computeSlots,
  pickRoundRobin,
  type Availability,
  type BusyBlock,
  type Slot,
} from "@/features/booking/slots";
import { phoneKey } from "@/features/telephony/lib";

export interface BookingQuestion {
  id: string;
  label: string;
  type: "text" | "long_text" | "select";
  required: boolean;
  options?: string[];
}

export async function loadPage(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug))
    throw new HttpError(404, "Página não encontrada", "not_found");
  const db = admin();
  const { data: page } = await db
    .from("booking_pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!page) throw new HttpError(404, "Página não encontrada", "not_found");
  const { data: account } = await db
    .from("accounts")
    .select("name, timezone")
    .eq("id", page.account_id)
    .single();
  return {
    page,
    accountName: account?.name ?? "",
    timeZone: account?.timezone || "America/Sao_Paulo",
  };
}

function candidates(page: {
  mode: string;
  owner_user_id: string | null;
  members: unknown;
}): { user_id: string; weight: number }[] {
  if (page.mode === "round_robin") {
    const list = Array.isArray(page.members)
      ? (page.members as { user_id?: string; weight?: number }[])
      : [];
    const valid = list
      .filter((m) => typeof m.user_id === "string")
      .map((m) => ({ user_id: m.user_id!, weight: Number(m.weight ?? 1) || 1 }));
    if (valid.length) return valid;
  }
  return page.owner_user_id ? [{ user_id: page.owner_user_id, weight: 1 }] : [];
}

async function busyByUser(
  accountId: string,
  users: string[],
  from: Date,
  to: Date,
  excludeEventId: string | null = null,
): Promise<Map<string, BusyBlock[]>> {
  const map = new Map<string, BusyBlock[]>(users.map((u) => [u, []]));
  if (users.length === 0) return map;
  const { data } = await admin()
    .from("events")
    .select("id, owner_user_id, starts_at, ends_at, status")
    .eq("account_id", accountId)
    .in("owner_user_id", users)
    .neq("status", "canceled")
    .lt("starts_at", to.toISOString())
    .gt("ends_at", from.toISOString())
    .limit(2000);
  for (const e of data ?? []) {
    if (!e.owner_user_id || e.id === excludeEventId) continue;
    map
      .get(e.owner_user_id)
      ?.push({ start: new Date(e.starts_at).getTime(), end: new Date(e.ends_at).getTime() });
  }
  // ocupado da agenda pessoal (Google/Outlook) de quem conectou
  const cal = await import("@/backend/calendar/oauth.server");
  const conns = await cal.connectionsFor(accountId, users);
  const external = await Promise.all(conns.map((c) => cal.externalBusy(c, from, to)));
  conns.forEach((c, i) => map.get(c.user_id)?.push(...(external[i] ?? [])));
  // ocupado das agendas Google/Microsoft conectadas pela Zernio (ligadas à pessoa pelo e-mail)
  const { zernioBusy } = await import("@/backend/calendar/zernio-busy.server");
  for (const [userId, blocks] of await zernioBusy(accountId, users, from, to))
    map.get(userId)?.push(...blocks);
  return map;
}

type PageRow = Awaited<ReturnType<typeof loadPage>>["page"];
type SlotPage = Pick<
  PageRow,
  "availability" | "duration_min" | "buffer_min" | "step_min" | "min_notice_min" | "window_days"
>;

function slotOptions(page: SlotPage, timeZone: string, busy: BusyBlock[]) {
  return {
    timeZone,
    now: Date.now(),
    availability: (page.availability ?? {}) as Availability,
    durationMin: page.duration_min,
    bufferMin: page.buffer_min,
    stepMin: page.step_min,
    minNoticeMin: page.min_notice_min,
    windowDays: page.window_days,
    busy,
  };
}

/** Horários em que pelo menos um atendente está livre. */
export async function freeSlots(slug: string): Promise<{ slots: Slot[]; timeZone: string }> {
  const { page, timeZone } = await loadPage(slug);
  const people = candidates(page);
  if (people.length === 0) return { slots: [], timeZone };
  const from = new Date();
  const to = new Date(Date.now() + (page.window_days + 1) * 86_400_000);
  const busy = await busyByUser(
    page.account_id,
    people.map((p) => p.user_id),
    from,
    to,
  );
  const seen = new Map<string, Slot>();
  for (const p of people)
    for (const s of computeSlots(slotOptions(page, timeZone, busy.get(p.user_id) ?? [])))
      seen.set(s.start, s);
  return { slots: [...seen.values()].sort((a, b) => a.start.localeCompare(b.start)), timeZone };
}

/** Confere de novo no momento da reserva (outro cliente pode ter pego o horário) e escolhe quem atende. */
async function pickHost(page: PageRow, timeZone: string, start: Date, end: Date): Promise<string> {
  const db = admin();
  const people = candidates(page);
  const busy = await busyByUser(
    page.account_id,
    people.map((p) => p.user_id),
    new Date(start.getTime() - 86_400_000),
    new Date(end.getTime() + 86_400_000),
  );
  const free = people.filter((p) =>
    computeSlots(slotOptions(page, timeZone, busy.get(p.user_id) ?? [])).some(
      (s) => s.start === start.toISOString(),
    ),
  );
  if (free.length === 0)
    throw new HttpError(409, "Esse horário acabou de ser ocupado. Escolha outro.", "slot_taken");

  let host = free[0]!.user_id;
  if (page.mode === "round_robin" && free.length > 1) {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: recent } = await db
      .from("meetings")
      .select("host_user_id")
      .eq("account_id", page.account_id)
      .gte("created_at", since)
      .in(
        "host_user_id",
        free.map((f) => f.user_id),
      );
    const load: Record<string, number> = {};
    for (const r of recent ?? [])
      if (r.host_user_id) load[r.host_user_id] = (load[r.host_user_id] ?? 0) + 1;
    host = pickRoundRobin(free, load) ?? host;
  }

  return host;
}

export interface BookInput {
  slug: string;
  start: string;
  name: string;
  email: string | null;
  phone: string | null;
  answers: Record<string, string>;
  consent: boolean;
  ip: string;
  userAgent: string;
}

/**
 * Contato que já existe na conta com este e-mail ou celular (só para decidir o que a resposta
 * mostra e para marcar a ficha nova como possível duplicata). E-mail sem diferenciar maiúsculas;
 * celular pelos últimos 8 dígitos, como findContactByPhone (com ou sem 55, com ou sem +, com ou
 * sem o 9). Na dúvida conta como existente: o pior caso é a sala ir só pelo e-mail.
 */
async function findExistingContact(
  accountId: string,
  email: string | null,
  phone: string | null,
): Promise<string | null> {
  const db = admin();
  if (email) {
    const { data } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .ilike("email", escapeLike(email))
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  const key = phoneKey(phone);
  if (key.length >= 8) {
    const { data } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .ilike("phone", `%${key}`)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

export async function book(input: BookInput) {
  const { page, timeZone, accountName } = await loadPage(input.slug);
  const db = admin();
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Horário inválido", "bad_start");
  const end = new Date(start.getTime() + page.duration_min * 60_000);
  const questions = (Array.isArray(page.questions)
    ? page.questions
    : []) as unknown as BookingQuestion[];
  for (const q of questions)
    if (q.required && !String(input.answers[q.id] ?? "").trim())
      throw new HttpError(422, `Responda: ${q.label}`, "missing_answer");

  const host = await pickHost(page, timeZone, start, end);

  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.replace(/\D/g, "") || null;
  // Nunca reaproveita contato pelo e-mail ou celular digitado (mesma regra do chat do site): quem
  // digita não provou que é o dono. O agendamento cria um contato novo; juntar com o existente é
  // decisão do atendente (mesclar). Se o dado bateu com um cadastro, a resposta não leva a sala.
  const existingId = await findExistingContact(page.account_id, email, phone);
  const matchedExisting = existingId !== null;
  const { data: c, error } = await db
    .from("contacts")
    .insert({
      account_id: page.account_id,
      name: input.name.trim().slice(0, 160),
      email,
      phone,
      source: "agendamento",
      owner_user_id: host,
      // possível duplicata: o atendente confere e mescla (o dado digitado não prova posse)
      ...(existingId ? { custom: { duplicate_of: existingId } } : {}),
    })
    .select("id")
    .single();
  if (error)
    throw new HttpError(500, `Não deu para registrar o contato: ${error.message}`, "contact");
  const contactId: string = c.id;
  await db.from("consents").insert([
    {
      account_id: page.account_id,
      contact_id: contactId,
      channel: "meeting_recording",
      status: input.consent ? "granted" : "revoked",
      basis: "consent",
      source: "agendamento",
      proof: {
        ip_hash: input.ip,
        ua: input.userAgent.slice(0, 200),
        page: page.slug,
        at: new Date().toISOString(),
      },
    },
  ]);

  let dealId: string | null = null;
  if (page.create_deal) {
    const { data: pipe } = await db
      .from("pipelines")
      .select("id")
      .eq("account_id", page.account_id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: stage } = pipe
      ? await db
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipe.id)
          .order("position")
          .limit(1)
          .maybeSingle()
      : { data: null };
    if (pipe && stage) {
      const { data: d } = await db
        .from("deals")
        .insert({
          account_id: page.account_id,
          pipeline_id: pipe.id,
          stage_id: stage.id,
          contact_id: contactId,
          title: `${page.title} · ${input.name}`.slice(0, 160),
          owner_user_id: host,
          source: "agendamento",
          value: 0,
        })
        .select("id")
        .single();
      dealId = d?.id ?? null;
    }
  }

  const description = Object.entries(input.answers)
    .map(([k, v]) => `${questions.find((q) => q.id === k)?.label ?? k}: ${v}`)
    .join("\n");
  const { meeting, guestToken } = await createMeeting({
    accountId: page.account_id,
    title: `${page.title} · ${input.name}`,
    hostUserId: host,
    contactId,
    dealId,
    bookingPageId: page.id,
    playbookId: page.playbook_id,
    start,
    end,
    answers: input.answers,
  });
  if (description) await db.from("events").update({ description }).eq("id", meeting.event_id!);
  await enqueueInviteAndReminders(page.account_id, meeting.id, start);
  await db.rpc("notify_user", {
    _account: page.account_id,
    _user: host,
    _kind: "meeting_booked",
    _title: `Nova reunião marcada: ${input.name}`,
    _body: `${page.title}`,
    _link: `/reunioes/${meeting.id}`,
  });
  return {
    meetingId: meeting.id,
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone,
    accountName,
    // O convite (com o link da sala) segue pelo e-mail informado; quem digitou o dado de outra
    // pessoa não recebe a sala na tela.
    joinUrl: publicBookingJoinUrl({ matchedExisting, meetingId: meeting.id, guestToken }),
    message: page.confirmation_message,
  };
}

// ───────────────────────── remarcar e agendar para um contato já conhecido ─────────────────────────

const WEEKDAYS_9_TO_18: Availability = Object.fromEntries(
  ["1", "2", "3", "4", "5"].map((d) => [d, [{ start: "09:00", end: "18:00" }]]),
);

export interface MeetingForSlots {
  account_id: string;
  host_user_id: string | null;
  booking_page_id: string | null;
  event_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
}

/** Regras de horário para remarcar: a página da reunião, senão a do anfitrião, senão seg a sex 9h às 18h. */
async function pageForMeeting(m: MeetingForSlots): Promise<SlotPage> {
  const db = admin();
  const cols = "availability, duration_min, buffer_min, step_min, min_notice_min, window_days";
  let page: SlotPage | null = null;
  if (m.booking_page_id)
    page =
      (await db.from("booking_pages").select(cols).eq("id", m.booking_page_id).maybeSingle())
        .data ?? null;
  if (!page && m.host_user_id)
    page =
      (
        await db
          .from("booking_pages")
          .select(cols)
          .eq("account_id", m.account_id)
          .eq("owner_user_id", m.host_user_id)
          .eq("is_active", true)
          .order("created_at")
          .limit(1)
          .maybeSingle()
      ).data ?? null;
  const base: SlotPage = page ?? {
    availability: WEEKDAYS_9_TO_18 as never,
    duration_min: 30,
    buffer_min: 10,
    step_min: 30,
    min_notice_min: 120,
    window_days: 14,
  };
  const s = m.scheduled_start ? new Date(m.scheduled_start).getTime() : NaN;
  const e = m.scheduled_end ? new Date(m.scheduled_end).getTime() : NaN;
  const dur = Math.round((e - s) / 60_000);
  return Number.isFinite(dur) && dur >= 10 && dur <= 240 ? { ...base, duration_min: dur } : base;
}

/** Horários livres do anfitrião para remarcar (o próprio horário atual não conta como ocupado). */
export async function rescheduleSlots(
  m: MeetingForSlots,
): Promise<{ slots: Slot[]; timeZone: string; durationMin: number }> {
  const db = admin();
  const { data: account } = await db
    .from("accounts")
    .select("timezone")
    .eq("id", m.account_id)
    .single();
  const timeZone = account?.timezone || "America/Sao_Paulo";
  const page = await pageForMeeting(m);
  if (!m.host_user_id) return { slots: [], timeZone, durationMin: page.duration_min };
  const from = new Date();
  const to = new Date(Date.now() + (page.window_days + 1) * 86_400_000);
  const busy = await busyByUser(m.account_id, [m.host_user_id], from, to, m.event_id);
  return {
    slots: computeSlots(slotOptions(page, timeZone, busy.get(m.host_user_id) ?? [])),
    timeZone,
    durationMin: page.duration_min,
  };
}

/** Confere que o horário escolhido continua livre; devolve início e fim. */
export async function assertRescheduleSlot(
  m: MeetingForSlots,
  startIso: string,
): Promise<{ start: Date; end: Date }> {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Horário inválido", "bad_start");
  const { slots, durationMin } = await rescheduleSlots(m);
  if (!slots.some((s) => s.start === start.toISOString()))
    throw new HttpError(409, "Esse horário acabou de ser ocupado. Escolha outro.", "slot_taken");
  return { start, end: new Date(start.getTime() + durationMin * 60_000) };
}

export interface BookForContactInput {
  slug: string;
  start: string;
  contactId: string;
  source: string;
  note?: string | null;
}

/** Marca numa página de agendamento para um contato que já está no CRM (ex.: IA do WhatsApp). */
export async function bookForContact(input: BookForContactInput) {
  const { page, timeZone } = await loadPage(input.slug);
  const db = admin();
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Horário inválido", "bad_start");
  const end = new Date(start.getTime() + page.duration_min * 60_000);
  const { data: contact } = await db
    .from("contacts")
    .select("id, name, account_id")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact || contact.account_id !== page.account_id)
    throw new HttpError(404, "Contato não encontrado", "not_found");
  const host = await pickHost(page, timeZone, start, end);
  const name = contact.name ?? "cliente";
  const { meeting } = await createMeeting({
    accountId: page.account_id,
    title: `${page.title} · ${name}`,
    hostUserId: host,
    contactId: contact.id,
    bookingPageId: page.id,
    playbookId: page.playbook_id,
    start,
    end,
  });
  if (input.note && meeting.event_id)
    await db.from("events").update({ description: input.note }).eq("id", meeting.event_id);
  await enqueueInviteAndReminders(page.account_id, meeting.id, start);
  await db.rpc("notify_user", {
    _account: page.account_id,
    _user: host,
    _kind: "meeting_booked",
    _title: `Nova reunião marcada: ${name}`,
    _body: `${page.title} · ${input.source}`,
    _link: `/reunioes/${meeting.id}`,
  });
  return { meetingId: meeting.id, start: start.toISOString(), timeZone };
}
