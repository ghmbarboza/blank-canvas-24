import { CalendarPlus } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

import { eventsOnDay } from "./calendar";
import { EventBlock } from "./EventBlock";
import type { AgendaEvent } from "./types";

interface Props {
  day: Date;
  events: AgendaEvent[];
  onEdit: (event: AgendaEvent) => void;
  onNew: () => void;
}

// Abaixo de md a grade não cabe: o dia vira uma lista.
export function DayList({ day, events, onEdit, onNew }: Props) {
  const list = eventsOnDay(day, events);
  if (!list.length) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="Nada marcado neste dia"
        description="Agende uma reunião, visita ou demonstração com um contato."
        action={
          <Button size="sm" onClick={onNew}>
            Novo evento
          </Button>
        }
      />
    );
  }
  return (
    <ul className="space-y-2 p-4">
      {list.map((ev) => (
        <li key={ev.row.id}>
          <EventBlock event={ev} variant="row" onEdit={onEdit} />
        </li>
      ))}
    </ul>
  );
}
