import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Skeleton } from "@/components/ui/skeleton";
import { useContactEvents } from "../api";
import { PanelSection } from "./PanelSection";

export function EventsBlock({ accountId, contactId }: { accountId: string; contactId: string }) {
  const events = useContactEvents(accountId, contactId);

  return (
    <PanelSection title="Próximos eventos">
      {events.isLoading ? (
        <Skeleton className="h-14 w-full rounded-xl" />
      ) : events.isError ? (
        <p className="text-[13px] text-danger">Não deu para carregar a agenda.</p>
      ) : !events.data?.length ? (
        <p className="text-[13px] text-muted-foreground">
          Nada agendado. Use “Agendar” no próximo passo.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.data.map((e) => {
            const start = new Date(e.starts_at);
            return (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
              >
                <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-primary-soft py-1 text-primary">
                  <span className="text-[10px] font-semibold uppercase">
                    {format(start, "MMM", { locale: ptBR })}
                  </span>
                  <span className="font-display text-[17px] leading-none font-semibold tabular-nums">
                    {format(start, "dd")}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{e.title}</p>
                  <p className="text-[12px] text-subtle tabular-nums">
                    {format(start, "EEEE, HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PanelSection>
  );
}
