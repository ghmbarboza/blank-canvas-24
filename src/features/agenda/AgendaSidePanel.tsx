import { Link } from "@tanstack/react-router";
import { addDays, format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarClock,
  Clock,
  Copy,
  Link2,
  MapPin,
  Phone,
  Plus,
  Settings2,
  Bot,
  Video,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookingPages, type BookingPage } from "@/features/booking/api";
import { StartMeetingButton } from "@/features/meetings/StartMeetingButton";
import { useAccountId } from "@/lib/account";
import { cn } from "@/lib/utils";

import { useEventMeeting, useUpcomingEvents } from "./api";
import { durationLabel, formatSpan } from "./calendar";
import { EventBlock } from "./EventBlock";
import { safeUrl } from "./eventTone";
import type { AgendaEvent } from "./types";

interface Props {
  now: Date;
  onlyMine: boolean;
  userId: string | null;
  onEdit: (event: AgendaEvent) => void;
}

const LATER_LIMIT = 4;

// `now` é a hora de parede da conta: "hoje" é o hoje do fuso da conta, não do navegador.
function dayLabel(d: Date, now: Date): string {
  if (isSameDay(d, now)) return "Hoje";
  if (isSameDay(d, addDays(now, 1))) return "Amanhã";
  return format(d, "EEE, d 'de' MMM", { locale: ptBR });
}

// Painel da direita: a próxima reunião com o briefing da IA, os links de agendamento e o que vem depois.
export function AgendaSidePanel({ now, onlyMine, userId, onEdit }: Props) {
  const upcoming = useUpcomingEvents(onlyMine ? userId : null);
  const list = upcoming.data ?? [];
  const [next, ...later] = list;

  return (
    <aside
      aria-label="Próxima reunião e links de agendamento"
      className="scrollbar-thin hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface xl:flex"
    >
      <section aria-labelledby="agenda-proxima" className="border-b border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="agenda-proxima" className="eyebrow">
            {next && next.start <= now ? "Agora" : "Próxima"}
          </h2>
          {next && next.start <= now && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              <span className="size-1.5 rounded-full bg-success" aria-hidden /> Em andamento
            </span>
          )}
        </div>
        {upcoming.isLoading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : upcoming.isError ? (
          <p className="text-[13px] text-danger">Não foi possível carregar a próxima reunião.</p>
        ) : next ? (
          <NextMeetingCard event={next} onEdit={onEdit} />
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Nada marcado à frente. Arraste na grade para criar um horário ou mande um link de
            agendamento.
          </p>
        )}
      </section>

      <BookingLinks />

      {later.length > 0 && (
        <section aria-labelledby="agenda-depois" className="p-4">
          <h2 id="agenda-depois" className="eyebrow mb-2">
            Em seguida
          </h2>
          <div className="space-y-1.5">
            {later.slice(0, LATER_LIMIT).map((ev, i) => {
              const label = dayLabel(ev.start, now);
              const prev = i === 0 ? next : later[i - 1];
              const showLabel = !prev || dayLabel(prev.start, now) !== label;
              return (
                <div key={ev.row.id}>
                  {showLabel && (
                    <p className="px-1 pt-1 pb-1 text-[12px] font-medium text-muted-foreground first-letter:uppercase">
                      {label}
                    </p>
                  )}
                  <EventBlock event={ev} variant="row" onEdit={onEdit} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}

interface Briefing {
  summary?: string;
  goal?: string;
}

function readBriefing(raw: unknown): Briefing | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const summary = typeof b["summary"] === "string" ? b["summary"] : undefined;
  const goal = typeof b["goal"] === "string" ? b["goal"] : undefined;
  return summary || goal ? { ...(summary ? { summary } : {}), ...(goal ? { goal } : {}) } : null;
}

function NextMeetingCard({
  event,
  onEdit,
}: {
  event: AgendaEvent;
  onEdit: (e: AgendaEvent) => void;
}) {
  const meeting = useEventMeeting(event.row.id);
  const briefing = readBriefing(meeting.data?.briefing);
  const link = safeUrl(event.row.meeting_url);
  const minutes = Math.round((event.end.getTime() - event.start.getTime()) / 60_000);
  const { contact } = event;

  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => onEdit(event)}
        className="block w-full rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Editar ${event.row.title}`}
      >
        <h3 className="font-display text-[18px] leading-snug font-medium">{event.row.title}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground tabular-nums">
          <Clock className="size-3.5" aria-hidden />
          {formatSpan(event)} ({durationLabel(minutes)})
        </p>
      </button>

      {contact && (
        <Link
          to="/contatos/$contactId"
          params={{ contactId: contact.id }}
          className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-2.5 transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ContactAvatar
            name={contact.name}
            src={contact.avatar_url}
            platform={contact.source}
            size={36}
          />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium">
              {contact.name ?? "Sem nome"}
            </span>
            {contact.company && (
              <span className="block truncate text-[12px] text-muted-foreground">
                {contact.company}
              </span>
            )}
          </span>
        </Link>
      )}

      {briefing && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-foreground uppercase">
            <Bot className="size-3.5" aria-hidden /> Briefing da IA
          </p>
          <div className="mt-2 space-y-2 border-l-2 border-border-strong pl-3 text-[13px] leading-relaxed text-muted-foreground">
            {briefing.summary && <p className="line-clamp-6">{briefing.summary}</p>}
            {briefing.goal && (
              <p>
                <strong className="font-semibold text-foreground">Foco sugerido:</strong>{" "}
                {briefing.goal}
              </p>
            )}
          </div>
          {meeting.data && (
            <Link
              to="/reunioes/$meetingId"
              params={{ meetingId: meeting.data.id }}
              className="mt-2 inline-block text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Ver briefing completo
            </Link>
          )}
        </div>
      )}

      <div className="mt-4">
        {link ? (
          <Button asChild className="w-full">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <Video aria-hidden /> Entrar na reunião
            </a>
          </Button>
        ) : (
          <StartMeetingButton
            variant="outline"
            eventId={event.row.id}
            contactId={event.row.contact_id}
            dealId={event.row.deal_id}
            title={event.row.title}
            start={event.row.starts_at}
            durationMin={minutes}
            className="w-full"
          />
        )}
      </div>
    </article>
  );
}

const LOCATION: Record<string, { label: string; icon: LucideIcon }> = {
  nexus_meet: { label: "Sala Nexus", icon: Video },
  phone: { label: "Ligação", icon: Phone },
  in_person: { label: "Presencial", icon: MapPin },
};

function locationOf(p: BookingPage): { label: string; icon: LucideIcon } {
  return LOCATION[p.location] ?? { label: p.location_detail || "Outro local", icon: Link2 };
}

function publicUrl(slug: string): string {
  return `${window.location.origin}/agendar/${slug}`;
}

async function copyLink(slug: string) {
  try {
    await navigator.clipboard.writeText(publicUrl(slug));
    toast.success("Link copiado");
  } catch {
    toast.error("Não deu para copiar. Abra o link e copie da barra do navegador.");
  }
}

function BookingLinks() {
  const accountId = useAccountId();
  const pages = useBookingPages(accountId);
  const active = (pages.data ?? []).filter((p) => p.is_active);

  return (
    <section aria-labelledby="agenda-links" className="border-b border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="agenda-links" className="eyebrow">
          Links de agendamento
        </h2>
        <Button asChild variant="ghost" size="icon" className="size-7">
          <Link to="/agendamentos" aria-label="Criar link de agendamento">
            <Plus aria-hidden />
          </Link>
        </Button>
      </div>
      {pages.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : pages.isError ? (
        <p className="text-[13px] text-danger">Não foi possível carregar os links.</p>
      ) : active.length === 0 ? (
        <Link
          to="/agendamentos"
          className="flex items-start gap-3 rounded-xl border border-dashed border-border-strong p-3 text-[13px] transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="block font-medium">Crie seu primeiro link</span>
            <span className="text-muted-foreground">
              O cliente escolhe um horário livre e a reunião entra aqui sozinha.
            </span>
          </span>
        </Link>
      ) : (
        <ul className="space-y-2">
          {active.map((p) => {
            const loc = locationOf(p);
            const Icon = loc.icon;
            return (
              <li
                key={p.id}
                className="group flex items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:bg-surface-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{p.title}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {p.duration_min} min · {loc.label}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void copyLink(p.slug)}
                  aria-label={`Copiar link de ${p.title}`}
                  title="Copiar link"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.94]",
                  )}
                >
                  <Copy className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        to="/agendamentos"
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <Settings2 className="size-3.5" aria-hidden /> Gerenciar disponibilidade
      </Link>
    </section>
  );
}
