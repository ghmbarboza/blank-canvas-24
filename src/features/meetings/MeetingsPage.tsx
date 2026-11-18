import { Link } from "@tanstack/react-router";
import { CalendarClock, Link2, MousePointerClick, Video } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";

import { useMeetings, type MeetingListRow } from "./api";
import { meetingScore } from "./lib";
import { MeetingsShell } from "./MeetingsRail";
import { StartMeetingButton } from "./StartMeetingButton";

function longWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

// Reuniões: a lista à esquerda e, sem nenhuma aberta, o resumo do período e a próxima da fila.
export function MeetingsPage() {
  return (
    <MeetingsShell>
      <Overview />
    </MeetingsShell>
  );
}

function Overview() {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const tz = current!.timezone || "America/Sao_Paulo";
  const meetings = useMeetings(accountId);
  const list = meetings.data ?? [];
  const live = list.filter((m) => m.status === "live");
  const upcoming = list
    // reunião marcada que já passou (mais de 1 h) não é "próxima": não aconteceu
    .filter(
      (m) =>
        m.status === "scheduled" &&
        (!m.scheduled_start || new Date(m.scheduled_start).getTime() > Date.now() - 3_600_000),
    )
    .sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? ""));
  const done = list.filter((m) => m.status === "ended");
  const scores = done.map(meetingScore).filter((s): s is number => s !== null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const withMinutes = done.filter((m) => m.minutes !== null).length;
  const next: MeetingListRow | undefined = live[0] ?? upcoming[0];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-4 py-3 sm:px-8 lg:px-10">
        <Button variant="outline" asChild>
          <Link to="/agendamentos">
            <Link2 /> Links de agendamento
          </Link>
        </Button>
        <StartMeetingButton label="Reunião agora" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:px-10">
        <p className="eyebrow">Atender</p>
        <h1 className="mt-2 font-display text-[26px] leading-tight font-medium sm:text-[30px]">
          Reuniões
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Sala própria, ata e nota em cada conversa. A IA transcreve, dá dicas ao vivo e, quando a
          reunião termina, escreve a ata e dá a nota pelo roteiro do playbook.
        </p>

        {meetings.isPending ? (
          <Skeleton className="mt-8 h-40 rounded-xl" />
        ) : (
          <>
            {next ? (
              <section
                aria-label="Próxima reunião"
                className="mt-8 rounded-xl bg-primary p-6 text-primary-foreground"
              >
                <p className="text-[12px] text-primary-foreground/70">
                  {next.status === "live" ? "Acontecendo agora" : "Próxima reunião"}
                </p>
                <p className="mt-1 font-display text-[24px] leading-tight font-semibold">
                  {next.title}
                </p>
                <p className="mt-1 text-[13px] text-primary-foreground/75 first-letter:uppercase">
                  {next.scheduled_start || next.started_at
                    ? longWhen((next.started_at ?? next.scheduled_start)!, tz)
                    : "Sem horário marcado"}
                  {next.contact && ` · ${next.contact.company ?? next.contact.name ?? ""}`}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="secondary" asChild>
                    <Link to="/sala/$meetingId" params={{ meetingId: next.id }}>
                      <Video /> {next.status === "live" ? "Entrar agora" : "Abrir a sala"}
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    asChild
                    className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                  >
                    <Link to="/reunioes/$meetingId" params={{ meetingId: next.id }}>
                      Ver briefing
                    </Link>
                  </Button>
                </div>
              </section>
            ) : (
              <section className="mt-8 flex items-start gap-4 rounded-xl border border-dashed border-border bg-surface p-6">
                <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="text-[15px] font-semibold">Nenhuma reunião marcada</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Mande um link de agendamento para os leads escolherem o horário, ou abra uma
                    sala agora e compartilhe o link do convidado.
                  </p>
                </div>
              </section>
            )}

            {list.length > 0 && (
              <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                <Stat label="Ao vivo agora" value={String(live.length)} />
                <Stat label="Próximas" value={String(upcoming.length)} />
                <Stat label="Com ata pronta" value={`${withMinutes} de ${done.length}`} />
                <Stat
                  label="Nota média"
                  value={avg === null ? "—" : String(avg)}
                  suffix={avg === null ? "" : "/100"}
                />
              </dl>
            )}

            {list.length > 0 && (
              <p className="mt-8 flex items-center gap-2 text-[13px] text-subtle">
                <MousePointerClick className="size-4" aria-hidden /> Clique numa reunião da lista
                para abrir a ata, a gravação e a transcrição.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, suffix = "" }: { label: string; value: string; suffix?: string }) {
  // zero não ganha destaque: fica discreto e o rótulo explica (Revenue-Centric)
  const zero = value === "0";
  return (
    <div className="bg-surface px-4 py-4">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 font-display leading-none font-semibold tabular-nums",
          zero ? "text-[18px] text-subtle" : "text-[24px]",
        )}
      >
        {value}
        {suffix && <span className="ml-0.5 text-[13px] font-normal text-subtle">{suffix}</span>}
      </dd>
    </div>
  );
}
