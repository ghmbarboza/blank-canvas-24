import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Inbox, Search, SearchX } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import {
  CONVERSATION_LIMIT,
  useChannels,
  useConversations,
  useConversationsRealtime,
  useLoadOlderConversations,
  useMembers,
} from "../api";
import { useMessageSearch } from "../api-messages";
import { isAiActive } from "../lib/ai";
import {
  DEFAULT_FILTERS,
  applyFilters,
  countByScope,
  countByStatus,
  platformsOf,
  tagsOf,
} from "../lib/filters";
import { STATUS_LABEL, type InboxFilters } from "../types";
import { ConversationFilters } from "./ConversationFilters";
import { ConversationListItem } from "./ConversationListItem";
import { SavedViews } from "./SavedViews";

const ESTIMATED_ROW = 104;
const SEARCH_DEBOUNCE_MS = 300;

export function ConversationList({ accountId }: { accountId: string }) {
  const { user } = useAuth();
  const params = useParams({ strict: false });
  const selectedId = params.conversationId ?? null;
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversations = useConversations(accountId);
  const channels = useChannels(accountId);
  const members = useMembers(accountId);
  useConversationsRealtime(accountId);
  const loadOlder = useLoadOlderConversations(accountId);
  const [exhausted, setExhausted] = useState(false);

  const channelsById = useMemo(
    () => new Map((channels.data ?? []).map((c) => [c.id, c])),
    [channels.data],
  );
  const memberName = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.userId, m.name])),
    [members.data],
  );
  const all = useMemo(() => conversations.data ?? [], [conversations.data]);
  const counts = useMemo(() => countByStatus(all), [all]);
  const allTags = useMemo(() => tagsOf(all), [all]);
  const scopeCounts = useMemo(
    () => countByScope(all, filters.status, user?.id ?? null, channelsById),
    [all, filters.status, user?.id, channelsById],
  );
  // busca no texto das mensagens: espera a pessoa parar de digitar antes de ir ao banco
  const [searchTerm, setSearchTerm] = useState(filters.search);
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(filters.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters.search]);
  const bodySearch = useMessageSearch(accountId, searchTerm);
  const bodyMatches = filters.search.trim() ? bodySearch.data : undefined;
  const visible = useMemo(
    () => applyFilters(all, filters, user?.id ?? null, channelsById, bodyMatches),
    [all, filters, user?.id, channelsById, bodyMatches],
  );

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW,
    overscan: 8,
    getItemKey: (i) => visible[i]?.conversation.id ?? i,
  });

  const filtered =
    filters.search || filters.scope !== "all" || filters.unread || filters.platform || filters.tag;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border px-4 pt-6 pb-3 lg:px-8">
        <p className="text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">Atender</p>
        <div className="flex items-center justify-between">
          <h1 className="font-display text-[24px] leading-tight font-medium">Caixa de entrada</h1>
          {all.length >= CONVERSATION_LIMIT && (
            <span
              className="text-[11px] text-subtle tabular-nums"
              title="Conversas carregadas nesta tela"
            >
              {all.length} carregadas
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 shadow-xs focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 text-subtle" aria-hidden />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Buscar por nome ou mensagem"
              aria-label="Buscar conversas"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </label>
          <SavedViews accountId={accountId} filters={filters} onApply={setFilters} />
        </div>
        <ConversationFilters
          filters={filters}
          counts={counts}
          scopeCounts={scopeCounts}
          platforms={platformsOf(channels.data ?? [])}
          tags={allTags}
          onChange={setFilters}
        />
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-3"
        aria-label="Conversas"
      >
        {conversations.isLoading ? (
          <ListSkeleton />
        ) : conversations.isError ? (
          <EmptyState
            icon={Inbox}
            title="Não deu para carregar as conversas"
            description={errorMessage(conversations.error)}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={filtered ? SearchX : Inbox}
            title={
              filtered
                ? "Nenhuma conversa com esse filtro. Limpe a busca ou troque o status"
                : `Nenhuma conversa em ${STATUS_LABEL[filters.status]}`
            }
            description={
              filtered
                ? "Tente outro termo ou limpe os filtros."
                : "Quando chegar mensagem nos seus canais, ela aparece aqui."
            }
          />
        ) : (
          <ul
            role="list"
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const item = visible[row.index];
              if (!item) return null;
              const assignee = item.conversation.assignee_user_id;
              const channel = item.conversation.channel_id
                ? channelsById.get(item.conversation.channel_id)
                : undefined;
              return (
                <li
                  key={row.key}
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-1"
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <ConversationListItem
                    item={item}
                    channel={channel}
                    aiActive={isAiActive(item.conversation, channel)}
                    assigneeName={assignee ? (memberName.get(assignee) ?? null) : null}
                    isMine={!!assignee && assignee === user?.id}
                    selected={item.conversation.id === selectedId}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {all.length >= CONVERSATION_LIMIT && !exhausted && !conversations.isLoading && (
          <div className="flex justify-center py-3">
            <button
              type="button"
              disabled={loadOlder.isPending}
              onClick={() =>
                loadOlder.mutate(undefined, { onSuccess: (r) => !r.hasMore && setExhausted(true) })
              }
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {loadOlder.isPending ? "Carregando…" : "Carregar conversas mais antigas"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-1" aria-busy="true" aria-label="Carregando conversas">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 px-2 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
