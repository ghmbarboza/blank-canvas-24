import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MessagesSquare } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { formatDayLabel } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { MESSAGE_LIMIT, useLoadOlderMessages, useMessages, useMessagesRealtime } from "../api";
import { buildThread } from "../lib/thread";
import type { Member, ThreadMessage } from "../types";
import { MessageBubble } from "./MessageBubble";

const BOTTOM_THRESHOLD = 80;

interface Props {
  accountId: string;
  conversationId: string;
  aiActive: boolean;
  isGroup: boolean;
  contactName: string;
  members: Member[];
  onInbound: () => void;
}

export function MessageThread({
  accountId,
  conversationId,
  aiActive,
  isGroup,
  contactName,
  members,
  onInbound,
}: Props) {
  const { user } = useAuth();
  const messages = useMessages(accountId, conversationId);
  useMessagesRealtime(accountId, conversationId);
  const loadOlder = useLoadOlderMessages(accountId, conversationId);
  const [exhausted, setExhausted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);
  const [hasNew, setHasNew] = useState(false);

  const list = useMemo(() => messages.data ?? [], [messages.data]);
  const items = useMemo(() => buildThread(list), [list]);
  const memberName = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);
  const aiPreparing = useAiPreparing(aiActive, list[list.length - 1]);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottomRef.current = true;
    setHasNew(false);
  }, []);

  // Mídia que termina de carregar muda a altura: se o usuário estava no fim, continua no fim.
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el) return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [messages.isSuccess]);

  useLayoutEffect(() => {
    const last = list[list.length - 1];
    if (!last) return;
    const previous = lastIdRef.current;
    lastIdRef.current = last.id;
    if (previous === last.id) return;
    const el = scrollRef.current;
    if (previous === null) {
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }
    const mine = last.direction === "out" && (last.optimistic || last.sender_user_id === user?.id);
    if (mine || atBottomRef.current) scrollToBottom(true);
    else setHasNew(true);
    if (last.direction === "in") onInbound();
  }, [list, user?.id, onInbound, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    atBottomRef.current = atBottom;
    if (atBottom && hasNew) setHasNew(false);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin h-full overflow-y-auto px-3 py-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-label="Mensagens"
      >
        {messages.isLoading ? (
          <ThreadSkeleton />
        ) : messages.isError ? (
          <EmptyState
            icon={MessagesSquare}
            title="Não deu para carregar as mensagens"
            description={errorMessage(messages.error)}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="Nenhuma mensagem ainda"
            description="Escreva abaixo para começar a conversa."
          />
        ) : (
          <div ref={contentRef} className="mx-auto flex max-w-3xl flex-col">
            {list.length >= MESSAGE_LIMIT && !exhausted && (
              <div className="mb-4 flex justify-center">
                <button
                  type="button"
                  disabled={loadOlder.isPending}
                  onClick={() => {
                    // Mantém a mesma mensagem na tela depois de inserir as antigas em cima.
                    const el = scrollRef.current;
                    const before = el?.scrollHeight ?? 0;
                    loadOlder.mutate(undefined, {
                      onSuccess: (r) => {
                        if (!r.hasMore) setExhausted(true);
                        requestAnimationFrame(() => {
                          if (el) el.scrollTop += el.scrollHeight - before;
                        });
                      },
                    });
                  }}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {loadOlder.isPending ? "Carregando…" : "Carregar mensagens anteriores"}
                </button>
              </div>
            )}
            {items.map((item) =>
              item.kind === "day" ? (
                <div key={item.key} className="my-4 flex justify-center" role="separator">
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-medium text-subtle">
                    {formatDayLabel(item.iso)}
                  </span>
                </div>
              ) : (
                <MessageBubble
                  key={item.key}
                  message={item.message}
                  first={item.first}
                  last={item.last}
                  isGroup={isGroup}
                  contactName={contactName}
                  authorName={
                    item.message.sender_user_id
                      ? (memberName.get(item.message.sender_user_id) ?? null)
                      : null
                  }
                />
              ),
            )}
            {aiPreparing && <TypingIndicator label="A IA está preparando a resposta" />}
          </div>
        )}
      </div>
      {hasNew && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground shadow-primary transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-3.5" aria-hidden /> Novas mensagens
        </button>
      )}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-label="Carregando mensagens">
      <Skeleton className="h-12 w-1/2 rounded-2xl" />
      <Skeleton className="ml-auto h-12 w-2/5 rounded-2xl" />
      <Skeleton className="h-20 w-3/5 rounded-2xl" />
      <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
    </div>
  );
}

// Janela em que a IA costuma responder a uma mensagem recebida. Passou disso sem resposta, some.
const AI_REPLY_WINDOW_MS = 90_000;

// Não há sinal de "digitando" do canal; o que existe é a IA ativa com a última mensagem recebida
// e ainda sem resposta. Enquanto isso, mostra que a IA está escrevendo.
function useAiPreparing(aiActive: boolean, last: ThreadMessage | undefined): boolean {
  const lastInboundAt = last?.direction === "in" ? new Date(last.created_at).getTime() : null;
  const [openedAt] = useState(() => Date.now());
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    if (!aiActive || lastInboundAt === null) return;
    const id = window.setTimeout(
      () => setExpired(lastInboundAt),
      Math.max(0, lastInboundAt + AI_REPLY_WINDOW_MS - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [aiActive, lastInboundAt]);
  if (!aiActive || lastInboundAt === null || expired === lastInboundAt) return false;
  // Mensagem que já era velha quando a conversa abriu não acende o indicador.
  return lastInboundAt + AI_REPLY_WINDOW_MS > openedAt;
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="mt-4 flex flex-col items-end" role="status" aria-label={label}>
      <div className="flex items-center gap-1 rounded-2xl rounded-br-sm bg-primary-soft px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-primary/60 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 140}ms` }}
            aria-hidden
          />
        ))}
      </div>
      <span className="mt-1 px-1 text-[11px] text-subtle">{label}</span>
    </div>
  );
}
