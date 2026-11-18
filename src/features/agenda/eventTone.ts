import { isTemperature } from "@/components/common/temperature";

import type { AgendaEvent } from "./types";

// Cor do evento = temperatura do contato vinculado. Sem contato, neutro.
const TONE = {
  hot: "bg-hot-soft border-hot-line border-l-hot text-hot-fg",
  warm: "bg-warm-soft border-warm-line border-l-warm text-warm-fg",
  cold: "bg-cold-soft border-cold-line border-l-cold text-cold-fg",
  neutral: "bg-surface-2 border-border border-l-border-strong text-muted-foreground",
} as const;

export function eventTone(ev: AgendaEvent): string {
  const t = ev.contact?.temperature;
  return isTemperature(t) ? TONE[t] : TONE.neutral;
}

export function eventStateClass(ev: AgendaEvent): string {
  if (ev.row.status === "canceled") return "opacity-70 [&_[data-title]]:line-through";
  if (ev.row.status === "done" || ev.row.status === "no_show") return "opacity-55";
  return "";
}

export function eventAriaLabel(ev: AgendaEvent, span: string): string {
  const parts = [ev.row.title, span];
  if (ev.contact?.name) parts.push(ev.contact.name);
  if (ev.row.status === "canceled") parts.push("cancelado");
  if (ev.row.status === "done") parts.push("feito");
  if (ev.row.status === "no_show") parts.push("não compareceu");
  return parts.join(", ");
}

// Só abre link http/https: nada de javascript:, data: etc.
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
