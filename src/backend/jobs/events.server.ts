// Assinantes do outbox: automações, notificações e outras fases se registram aqui.
import type { Database } from "@/integrations/supabase/types";

export type DomainEvent = Database["public"]["Tables"]["domain_events"]["Row"];
type Subscriber = (events: DomainEvent[]) => Promise<void>;

const subscribers: Subscriber[] = [];
export function onDomainEvents(fn: Subscriber) {
  subscribers.push(fn);
}
export function eventSubscribers(): readonly Subscriber[] {
  return subscribers;
}
