import { format } from "date-fns";
import { Lock, Bot } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ThreadMessage } from "../types";
import { MessageMedia } from "./MessageMedia";
import { MessageStatus } from "./MessageStatus";

interface Props {
  message: ThreadMessage;
  first: boolean;
  last: boolean;
  isGroup: boolean;
  contactName: string;
  authorName: string | null;
}

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker", "file"]);

export function MessageBubble({
  message: m,
  first,
  last,
  isGroup,
  contactName,
  authorName,
}: Props) {
  const { user } = useAuth();
  const time = format(new Date(m.created_at), "HH:mm");
  const hasMedia = MEDIA_TYPES.has(m.type) && (Boolean(m.media_url) || Boolean(m.optimistic));

  if (m.sender_type === "system") {
    return (
      <p className="my-3 text-center text-[12px] text-subtle" title={formatDateTime(m.created_at)}>
        {m.body}
      </p>
    );
  }

  if (m.is_private) {
    const who = m.sender_user_id === user?.id ? "você" : (authorName ?? "equipe");
    return (
      <div className={cn("flex justify-center", first ? "mt-5" : "mt-2")}>
        <div className="w-full max-w-[92%] rounded-r-xl rounded-l-sm border border-l-[3px] border-note-line border-l-foreground/40 bg-note px-4 py-3 text-note-fg sm:max-w-[80%]">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">
            <Lock className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Nota interna · {who}</span>
            <span className="ml-auto pl-3 font-normal tabular-nums opacity-80">{time}</span>
          </div>
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.body}</p>
          <p className="mt-1.5 text-[11px] opacity-70">Só a equipe vê</p>
        </div>
      </div>
    );
  }

  const outgoing = m.direction === "out";
  const isAi = m.sender_type === "ai";
  const outAuthor = isAi ? "IA" : m.sender_user_id === user?.id ? "Você" : authorName;
  const inAuthor = isGroup ? (m.sender_name ?? m.sender_handle ?? "Participante") : null;
  const showMeta = last || m.status === "failed" || m.status === "queued";

  return (
    <div
      className={cn(
        "flex flex-col",
        outgoing ? "items-end" : "items-start",
        first ? "mt-4" : "mt-0.5",
      )}
    >
      {first && outgoing && outAuthor && (
        <span className="mb-1 inline-flex items-center gap-1 px-1 text-[11px] text-subtle">
          {isAi && <Bot className="size-3 text-primary" aria-hidden />}
          {outAuthor}
        </span>
      )}
      {first && inAuthor && (
        <span className="mb-1 px-1 text-[12px] font-medium text-primary">{inAuthor}</span>
      )}
      <div
        title={formatDateTime(m.created_at)}
        aria-label={!outgoing && !isGroup ? `${contactName}: ${m.body ?? m.type}` : undefined}
        className={cn(
          "max-w-[85%] space-y-2 rounded-2xl px-3.5 py-2 sm:max-w-[70%]",
          outgoing ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground",
          outgoing && last && "rounded-br-sm",
          !outgoing && last && "rounded-bl-sm",
          m.optimistic && m.status === "queued" && "opacity-80",
          m.status === "failed" && "ring-1 ring-danger",
        )}
      >
        {hasMedia && <MessageMedia message={m} outgoing={outgoing} />}
        {m.body && (
          <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap">{m.body}</p>
        )}
        {!m.body && !hasMedia && (
          <p className="text-[13px] italic opacity-80">Mensagem sem texto ({m.type})</p>
        )}
        {!hasMedia && m.transcript && (
          <p className="text-[13px] italic opacity-90">Transcrição: {m.transcript}</p>
        )}
      </div>
      {showMeta && (
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-subtle tabular-nums">
          <time dateTime={m.created_at}>{time}</time>
          {outgoing && <MessageStatus status={m.status} error={m.error} />}
        </div>
      )}
    </div>
  );
}
