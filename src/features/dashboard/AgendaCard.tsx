import { Skeleton } from "@/components/ui/skeleton";
import { formatSpan } from "@/features/agenda/calendar";

import { useTodayEvents } from "./api";
import { Card, EmptyNote } from "./ui";

export function AgendaCard({ className }: { className?: string }) {
  const { data, isLoading } = useTodayEvents();
  const events = (data ?? []).map((ev) => ({
    id: ev.row.id,
    when: formatSpan(ev),
    title: ev.row.title,
    who: ev.contact?.name ?? "",
  }));
  return (
    <Card
      id="painel-agenda"
      eyebrow="Hoje na agenda"
      title={
        events.length
          ? `${events.length} ${events.length === 1 ? "compromisso" : "compromissos"} hoje`
          : "Agenda de hoje"
      }
      link={{ to: "/agenda", label: "Abrir agenda" }}
      className={className}
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : events.length === 0 ? (
        <EmptyNote>Nada marcado para hoje.</EmptyNote>
      ) : (
        <ol className="relative ml-1.5 space-y-4 border-l border-border pl-5">
          {events.map((e, i) => (
            <li key={e.id} className="relative">
              <span
                className={`absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-surface ${i === 0 ? "bg-primary" : "bg-chart-4"}`}
                aria-hidden
              />
              <p className="text-[12px] font-medium text-foreground tabular-nums">{e.when}</p>
              <p className="mt-0.5 truncate text-[13px] font-medium">{e.title}</p>
              {e.who && <p className="truncate text-[12px] text-subtle">{e.who}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
