import type { Channel, ConversationStatus, InboxFilters, InboxItem, InboxScope } from "../types";
import { isAiActive } from "./ai";

export const DEFAULT_FILTERS: InboxFilters = {
  status: "open",
  scope: "all",
  unread: false,
  platform: null,
  search: "",
  tag: null,
};

/** Etiqueta como o banco aceita: minúsculas, sem espaço nas pontas, até 30 letras. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30);
}

/** Todas as etiquetas das conversas carregadas, sem repetir, para os filtros. */
export function tagsOf(items: InboxItem[]): string[] {
  return [...new Set(items.flatMap((i) => i.conversation.tags ?? []))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function displayName(item: InboxItem): string {
  const c = item.conversation;
  if (c.is_group) return c.title || "Grupo sem nome";
  return item.contact?.name || c.title || item.contact?.phone || "Contato sem nome";
}

export function applyFilters(
  items: InboxItem[],
  filters: InboxFilters,
  userId: string | null,
  channelsById: Map<string, Channel>,
  /** conversas em que alguma mensagem casou com a busca (busca no texto, feita no banco) */
  bodyMatches?: ReadonlySet<string>,
): InboxItem[] {
  const q = normalize(filters.search.trim());
  return items
    .filter(({ conversation: c, ...rest }) => {
      if (c.status !== filters.status) return false;
      const channel = c.channel_id ? channelsById.get(c.channel_id) : undefined;
      if (filters.scope === "mine" && c.assignee_user_id !== userId) return false;
      if (filters.scope === "unassigned" && c.assignee_user_id) return false;
      if (filters.scope === "ai" && !isAiActive(c, channel)) return false;
      if (filters.unread && c.unread_count <= 0) return false;
      if (filters.platform && channel?.platform !== filters.platform) return false;
      if (filters.tag && !(c.tags ?? []).includes(filters.tag)) return false;
      if (!q) return true;
      const haystack = normalize(
        `${displayName({ conversation: c, ...rest })} ${c.last_message_preview ?? ""}`,
      );
      return haystack.includes(q) || Boolean(bodyMatches?.has(c.id));
    })
    .sort((a, b) => timeOf(b) - timeOf(a));
}

function timeOf(item: InboxItem): number {
  const iso = item.conversation.last_message_at ?? item.conversation.created_at;
  return new Date(iso).getTime();
}

export function countByStatus(items: InboxItem[]): Record<ConversationStatus, number> {
  const counts: Record<ConversationStatus, number> = { open: 0, pending: 0, snoozed: 0, closed: 0 };
  for (const { conversation } of items) {
    const s = conversation.status;
    if (s === "open" || s === "pending" || s === "snoozed" || s === "closed") counts[s] += 1;
  }
  return counts;
}

export function platformsOf(channels: Channel[]): string[] {
  return [...new Set(channels.map((c) => c.platform))];
}

// Quantas conversas cada recorte mostraria na situação escolhida (sem busca, canal e não lidas).
export function countByScope(
  items: InboxItem[],
  status: ConversationStatus,
  userId: string | null,
  channelsById: Map<string, Channel>,
): Record<InboxScope, number> {
  const counts: Record<InboxScope, number> = { all: 0, mine: 0, unassigned: 0, ai: 0 };
  for (const { conversation: c } of items) {
    if (c.status !== status) continue;
    counts.all += 1;
    if (userId && c.assignee_user_id === userId) counts.mine += 1;
    if (!c.assignee_user_id) counts.unassigned += 1;
    if (isAiActive(c, c.channel_id ? channelsById.get(c.channel_id) : undefined)) counts.ai += 1;
  }
  return counts;
}
