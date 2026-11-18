// Chamadas da página pública "gerenciar reunião" (link assinado do convite, sem login).
import type { Slot } from "@/features/booking/slots";

export interface ManageInfo {
  title: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  confirmed: boolean;
  account_name: string;
  host_name: string | null;
  time_zone: string;
  actions: { canConfirm: boolean; canCancel: boolean; canReschedule: boolean };
  slots: Slot[];
}

export async function manageCall<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/public/meeting-manage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(j?.error ?? `Falha (${res.status})`);
  return j as T;
}

export function formatWhen(iso: string | null, tz: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}
