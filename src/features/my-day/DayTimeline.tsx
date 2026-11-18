import { Link } from "@tanstack/react-router";
import { CalendarPlus, Video } from "lucide-react";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Button } from "@/components/ui/button";
import { safeUrl } from "@/features/agenda/eventTone";
import { StartMeetingButton } from "@/features/meetings/StartMeetingButton";
import { cn } from "@/lib/utils";

import type { MyDay } from "./api";
import { formatClock, meetingProvider } from "./format";

type DayEvent = MyDay["events"][number];

interface Props {
  events: DayEvent[];
  now: Date;
  tz: string;
}

// Linha do tempo do dia: o que passou fica apagado, o próximo compromisso ganha destaque.
export function DayTimeline({ events, now, tz }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong px-5 py-6">
        <p className="text-[14px] font-medium">Agenda livre hoje.</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Bom momento para marcar uma conversa de acompanhamento com um cliente.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to="/agenda">
            <CalendarPlus aria-hidden /> Abrir a agenda
          </Link>
        </Button>
      </div>
    );
  }

  const nowMs = now.getTime();
  const nextId = events.find((e) => new Date(e.ends_at).getTime() >= nowMs)?.id ?? null;

  return (
    <ol className="relative space-y-7">
      <span className="absolute top-2 bottom-2 left-[7px] w-px bg-border" aria-hidden />
      {events.map((e) => {
        const past = new Date(e.ends_at).getTime() < nowMs;
        const isNext = e.id === nextId;
        return (
          <li key={e.id} className={cn("relative pl-8", past && "opacity-55")}>
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 rounded-full ring-4 ring-background",
                isNext
                  ? "left-[1px] size-3.5 bg-primary"
                  : past
                    ? "left-[3px] size-2.5 bg-border-strong"
                    : "left-[3px] size-2.5 border-2 border-border-strong bg-background",
              )}
            />
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
              <p
                className={cn(
                  "w-14 shrink-0 pt-0.5 text-[13px] tabular-nums",
                  isNext ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {formatClock(e.starts_at, tz)}
              </p>
              {isNext ? <NextEvent event={e} tz={tz} /> : <PlainEvent event={e} tz={tz} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PlainEvent({ event, tz }: { event: DayEvent; tz: string }) {
  return (
    <div className="min-w-0">
      <h3 className="truncate text-[15px] font-medium">{event.title}</h3>
      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
        {event.contact_name ?? "Sem contato"} · até {formatClock(event.ends_at, tz)}
      </p>
    </div>
  );
}

function NextEvent({ event, tz }: { event: DayEvent; tz: string }) {
  const link = safeUrl(event.meeting_url);
  const provider = meetingProvider(link);
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Próximo compromisso</p>
          <h3 className="mt-1 text-[16px] font-medium">{event.title}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
            {formatClock(event.starts_at, tz)} – {formatClock(event.ends_at, tz)}
          </p>
        </div>
        {provider && (
          <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium">
            {provider}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {event.contact_id ? (
          <Link
            to="/contatos/$contactId"
            params={{ contactId: event.contact_id }}
            className="flex min-w-0 items-center gap-2 rounded-full text-[13px] hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ContactAvatar name={event.contact_name} size={24} />
            <span className="truncate">{event.contact_name ?? "Contato"}</span>
          </Link>
        ) : (
          <span className="text-[13px] text-subtle">Sem contato vinculado</span>
        )}
        {link ? (
          <Button asChild size="sm">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <Video aria-hidden /> Entrar
            </a>
          </Button>
        ) : (
          <StartMeetingButton
            eventId={event.id}
            contactId={event.contact_id}
            title={event.title}
            start={event.starts_at}
            size="sm"
          />
        )}
      </div>
    </div>
  );
}
