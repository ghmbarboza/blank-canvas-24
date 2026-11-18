import { addDays, addMinutes, differenceInMinutes, format, parse, startOfDay } from "date-fns";
import { z } from "zod";

import type { EventInput } from "./api";
import { safeUrl } from "./eventTone";
import { fromWall } from "./tz";
import type { AgendaEvent, EventDraft } from "./types";

export const NONE = "none";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, "Dê um título ao evento").max(160, "Título muito longo"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha a data"),
    startTime: z.string(),
    endTime: z.string(),
    allDay: z.boolean(),
    contactId: z.string(),
    dealId: z.string(),
    ownerUserId: z.string(),
    location: z.string().trim().max(200, "Local muito longo"),
    meetingUrl: z
      .string()
      .trim()
      .max(500, "Link muito longo")
      .refine((v) => v === "" || safeUrl(v) !== null, "Use um link que comece com https://"),
    description: z.string().trim().max(2000, "Descrição muito longa"),
  })
  .superRefine((v, ctx) => {
    if (v.allDay) return;
    if (!TIME.test(v.startTime)) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Hora inválida" });
      return;
    }
    if (!TIME.test(v.endTime)) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Hora inválida" });
      return;
    }
    if (v.endTime <= v.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "O fim precisa ser depois do início",
      });
    }
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;

export const DURATIONS = [15, 30, 45, 60, 90] as const;

export function addToTime(time: string, minutes: number): string {
  const base = parse(time, "HH:mm", new Date(2000, 0, 1));
  const next = addMinutes(base, minutes);
  // Não deixa passar da meia-noite: o evento é de um dia só.
  return next.getDate() !== base.getDate() ? "23:59" : format(next, "HH:mm");
}

export function minutesBetween(start: string, end: string): number | null {
  if (!TIME.test(start) || !TIME.test(end)) return null;
  const ref = new Date(2000, 0, 1);
  return differenceInMinutes(parse(end, "HH:mm", ref), parse(start, "HH:mm", ref));
}

export function defaultsFor(
  event: AgendaEvent | null,
  draft: EventDraft | null,
  userId: string | null,
  now: Date,
): EventFormValues {
  if (event) {
    const r = event.row;
    return {
      title: r.title,
      date: format(event.start, "yyyy-MM-dd"),
      startTime: format(event.start, "HH:mm"),
      endTime: r.all_day ? "10:00" : format(event.end, "HH:mm"),
      allDay: r.all_day,
      contactId: r.contact_id ?? "",
      dealId: r.deal_id ?? NONE,
      ownerUserId: r.owner_user_id ?? NONE,
      location: r.location ?? "",
      meetingUrl: r.meeting_url ?? "",
      description: r.description ?? "",
    };
  }
  // Sem horário escolhido: próxima meia hora cheia.
  const fallbackStart = addMinutes(now, 30 - (now.getMinutes() % 30));
  const start = draft?.start ?? fallbackStart;
  const end = draft?.end ?? addMinutes(start, 30);
  return {
    title: "",
    date: format(start, "yyyy-MM-dd"),
    startTime: format(start, "HH:mm"),
    endTime: format(end, "HH:mm"),
    allDay: false,
    contactId: "",
    dealId: NONE,
    ownerUserId: userId ?? NONE,
    location: "",
    meetingUrl: "",
    description: "",
  };
}

export function toEventInput(v: EventFormValues, timeZone: string): EventInput {
  const day = parse(v.date, "yyyy-MM-dd", new Date());
  const start = v.allDay
    ? startOfDay(day)
    : parse(`${v.date} ${v.startTime}`, "yyyy-MM-dd HH:mm", new Date());
  const end = v.allDay
    ? addDays(startOfDay(day), 1)
    : parse(`${v.date} ${v.endTime}`, "yyyy-MM-dd HH:mm", new Date());
  return {
    title: v.title,
    starts_at: fromWall(start, timeZone).toISOString(),
    ends_at: fromWall(end, timeZone).toISOString(),
    all_day: v.allDay,
    contact_id: v.contactId || null,
    deal_id: v.contactId && v.dealId !== NONE ? v.dealId : null,
    owner_user_id: v.ownerUserId !== NONE ? v.ownerUserId : null,
    location: v.location || null,
    meeting_url: v.meetingUrl ? safeUrl(v.meetingUrl) : null,
    description: v.description || null,
  };
}
