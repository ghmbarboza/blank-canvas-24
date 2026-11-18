import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Link2, Search, Bot, Video, X } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";

import { STATUS_LABEL, useMeetings, type MeetingListRow } from "./api";
import { groupMeetings, meetingScore } from "./lib";
import { StartMeetingButton } from "./StartMeetingButton";

function timeOf(iso: string | null, tz: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

function dayOf(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: tz })
    .format(new Date(iso))
    .replace(".", "");
}

/** "14:30 – 15:15" no dia de hoje e ontem; "05 nov · 10:00" para o resto. */
function whenLine(m: MeetingListRow, groupId: string, tz: string): string {
  const start = m.started_at ?? m.scheduled_start;
  const end = m.started_at ? m.ended_at : m.scheduled_end;
  if (!start) return dayOf(m.created_at, tz);
  const range = end ? `${timeOf(start, tz)} – ${timeOf(end, tz)}` : timeOf(start, tz);
  if (groupId === "today" || groupId === "yesterday") return range;
  return `${dayOf(start, tz)} · ${range}`;
}

function startedFor(iso: string | null): string {
  if (!iso) return "Ao vivo agora";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? "Ao vivo, começou agora" : `Ao vivo há ${min} min`;
}

// Lista da esquerda: o que está acontecendo, o que vem e o que passou, com nota e ata à vista.
export function MeetingsRail({ selectedId }: { selectedId?: string | undefined }) {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const tz = current!.timezone || "America/Sao_Paulo";
  const meetings = useMeetings(accountId);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (meetings.data ?? []).filter(
      (m) =>
        !term ||
        m.title.toLowerCase().includes(term) ||
        (m.contact?.name ?? "").toLowerCase().includes(term) ||
        (m.contact?.company ?? "").toLowerCase().includes(term),
    );
    return groupMeetings(list);
  }, [meetings.data, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border px-4 py-3 lg:px-8">
        {searching ? (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Título, contato ou empresa"
              aria-label="Buscar reunião"
              className="h-9 pl-9"
            />
          </div>
        ) : (
          <div className="flex-1">
            <p className="text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Atender
            </p>
            <h2 className="font-display text-[17px] leading-tight font-medium">Suas reuniões</h2>
          </div>
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label={searching ? "Fechar a busca" : "Buscar reunião"}
          onClick={() => {
            setSearching((s) => !s);
            setQ("");
          }}
        >
          {searching ? <X /> : <Search />}
        </Button>
        <Button size="icon" variant="ghost" asChild className="lg:hidden">
          <Link to="/agendamentos" aria-label="Links de agendamento">
            <Link2 />
          </Link>
        </Button>
        <StartMeetingButton label="Agora" size="sm" className="lg:hidden" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-6">
        {meetings.isPending ? (
          <div className="space-y-2 pt-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : meetings.isError ? (
          <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">
            Não deu para carregar as reuniões. Atualize a página.
          </p>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={q ? "Nada com esse nome" : "Nenhuma reunião ainda"}
            description={
              q
                ? "Tente parte do título, o nome do contato ou a empresa."
                : "Mande um link de agendamento para os leads ou abra uma sala agora. Cada reunião aparece aqui com ata e nota."
            }
            action={
              !q && (
                <Button asChild variant="outline">
                  <Link to="/agendamentos">
                    <Link2 /> Criar link de agendamento
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          groups.map((g) => (
            <section key={g.id} aria-label={g.label} className="mt-3">
              <h2 className="eyebrow px-2 pb-2">{g.label}</h2>
              <ul className="space-y-1.5">
                {g.items.map((m) => (
                  <li key={m.id}>
                    {g.id === "live" ? (
                      <LiveItem m={m} selected={m.id === selectedId} />
                    ) : (
                      <MeetingItem
                        m={m}
                        when={whenLine(m, g.id, tz)}
                        selected={m.id === selectedId}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function Pill({ children, onNavy }: { children: React.ReactNode; onNavy: boolean }) {
  return (
    <span
      className={cn(
        "max-w-[45%] shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium",
        onNavy
          ? "border-white/25 text-primary-foreground/85"
          : "border-border bg-surface-2 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function LiveItem({ m, selected }: { m: MeetingListRow; selected: boolean }) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-surface",
        selected && "ring-2 ring-ring",
      )}
    >
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-success" aria-hidden />
      <Link
        to="/reunioes/$meetingId"
        params={{ meetingId: m.id }}
        className="block rounded-xl px-4 pt-3 pb-12 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
            {startedFor(m.started_at)}
          </span>
          {m.playbook && <Pill onNavy={false}>{m.playbook.name}</Pill>}
        </div>
        <p className="mt-1.5 truncate text-[15px] font-semibold">{m.title}</p>
        <p className="truncate text-[13px] text-muted-foreground">
          {m.contact?.company ?? m.contact?.name ?? "Sem contato ligado"}
        </p>
      </Link>
      <Button size="sm" variant="outline" asChild className="absolute right-3 bottom-3">
        <Link to="/sala/$meetingId" params={{ meetingId: m.id }}>
          <Video /> Entrar
        </Link>
      </Button>
    </div>
  );
}

function MeetingItem({
  m,
  when,
  selected,
}: {
  m: MeetingListRow;
  when: string;
  selected: boolean;
}) {
  const score = meetingScore(m);
  const hasMinutes = m.minutes !== null;
  const muted = m.status === "canceled" || m.status === "no_show";
  return (
    <Link
      to="/reunioes/$meetingId"
      params={{ meetingId: m.id }}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "block rounded-xl px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected ? "bg-primary text-primary-foreground" : "row-wash hover:bg-surface-2/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-[12px] tabular-nums",
            selected ? "text-primary-foreground/75" : "text-subtle",
          )}
        >
          {when}
        </span>
        {m.playbook && <Pill onNavy={selected}>{m.playbook.name}</Pill>}
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[15px] font-semibold",
          muted && !selected && "text-muted-foreground",
        )}
      >
        {m.title}
      </p>
      <p
        className={cn(
          "truncate text-[13px]",
          selected ? "text-primary-foreground/75" : "text-muted-foreground",
        )}
      >
        {m.contact?.company ?? m.contact?.name ?? "Sem contato ligado"}
      </p>
      {(hasMinutes || score !== null || muted || m.status === "scheduled") && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          {hasMinutes ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                selected ? "bg-white/15" : "bg-surface-2 text-muted-foreground",
              )}
            >
              <Bot className="size-3" aria-hidden /> Ata pronta
            </span>
          ) : (
            <span
              className={cn(
                muted && !selected
                  ? "text-danger"
                  : selected
                    ? "text-primary-foreground/75"
                    : "text-subtle",
              )}
            >
              {m.status === "scheduled" && m.guest_confirmed_at
                ? "Presença confirmada"
                : (STATUS_LABEL[m.status] ?? m.status)}
            </span>
          )}
          {score !== null && (
            <span className={selected ? "text-primary-foreground/75" : "text-muted-foreground"}>
              Nota{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  selected ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {score}
              </span>
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

/** Esqueleto de duas colunas: a lista fica à esquerda em tela larga; no celular, uma coisa por vez. */
export function MeetingsShell({
  selectedId,
  children,
}: {
  selectedId?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label="Lista de reuniões"
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-r border-border bg-background lg:flex lg:w-[340px]",
          selectedId ? "hidden" : "flex",
        )}
      >
        <MeetingsRail selectedId={selectedId} />
      </aside>
      <div
        className={cn("min-h-0 min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden lg:flex")}
      >
        {children}
      </div>
    </div>
  );
}
