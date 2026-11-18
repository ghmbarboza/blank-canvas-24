import type { Tables } from "@/integrations/supabase/types";

export type AgendaView = "day" | "week" | "month";

export type EventStatus = "scheduled" | "confirmed" | "done" | "canceled" | "no_show";

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  done: "Feito",
  canceled: "Cancelado",
  no_show: "Não compareceu",
};

export function isEventStatus(v: string): v is EventStatus {
  return v in EVENT_STATUS_LABEL;
}

export type EventRow = Tables<"events">;

export type EventContact = Pick<
  Tables<"contacts">,
  "id" | "name" | "company" | "avatar_url" | "source" | "temperature" | "score"
>;

export type EventDeal = Pick<Tables<"deals">, "id" | "title" | "value" | "status">;

// Evento já com as horas de parede (fuso da conta) e o contato/negócio resolvidos.
export interface AgendaEvent {
  row: EventRow;
  start: Date;
  end: Date;
  contact: EventContact | null;
  deal: EventDeal | null;
}

export interface Member {
  userId: string;
  name: string;
}

// Janela visível em hora de parede (fim exclusivo).
export interface WallRange {
  start: Date;
  end: Date;
}

export interface EventDraft {
  start: Date;
  end: Date;
}
