import type { ThreadMessage } from "../types";

// Mensagens do mesmo autor com menos de 5 min entre si viram um bloco só.
const GROUP_GAP_MS = 5 * 60_000;

export type ThreadItem =
  | { kind: "day"; key: string; iso: string }
  | { kind: "message"; key: string; message: ThreadMessage; first: boolean; last: boolean };

function authorKey(m: ThreadMessage): string {
  if (m.is_private) return `note:${m.sender_user_id ?? ""}`;
  if (m.direction === "in") return `in:${m.sender_handle ?? m.sender_name ?? ""}`;
  return `out:${m.sender_type}:${m.sender_user_id ?? ""}`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function sameBlock(a: ThreadMessage | undefined, b: ThreadMessage | undefined): boolean {
  if (!a || !b) return false;
  if (dayKey(a.created_at) !== dayKey(b.created_at)) return false;
  if (authorKey(a) !== authorKey(b)) return false;
  return (
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < GROUP_GAP_MS
  );
}

export function buildThread(messages: ThreadMessage[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let currentDay = "";
  messages.forEach((m, i) => {
    const day = dayKey(m.created_at);
    if (day !== currentDay) {
      currentDay = day;
      items.push({ kind: "day", key: `day-${day}`, iso: m.created_at });
    }
    items.push({
      kind: "message",
      key: m.id,
      message: m,
      first: !sameBlock(messages[i - 1], m),
      last: !sameBlock(m, messages[i + 1]),
    });
  });
  return items;
}

// Participantes que apareceram nas mensagens carregadas (o banco não guarda a lista do grupo).
export function countParticipants(messages: ThreadMessage[]): number {
  const set = new Set<string>();
  for (const m of messages) {
    if (m.direction === "in") {
      const id = m.sender_handle ?? m.sender_name;
      if (id) set.add(id);
    }
  }
  return set.size;
}
