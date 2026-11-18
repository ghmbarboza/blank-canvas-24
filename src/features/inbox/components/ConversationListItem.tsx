import { Link } from "@tanstack/react-router";
import { Bot, Users } from "lucide-react";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { TempChip } from "@/components/common/TempChip";
import { formatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { displayName } from "../lib/filters";
import type { Channel, InboxItem } from "../types";

interface Props {
  item: InboxItem;
  channel: Channel | undefined;
  assigneeName: string | null;
  isMine: boolean;
  aiActive: boolean;
  selected: boolean;
}

export function ConversationListItem({
  item,
  channel,
  assigneeName,
  isMine,
  aiActive,
  selected,
}: Props) {
  const { conversation: c, contact } = item;
  const name = displayName(item);
  const unread = c.unread_count > 0;
  const owner = assigneeName ? (isMine ? "Com você" : assigneeName) : null;
  const hasMeta = Boolean(contact?.temperature) || Boolean(owner) || aiActive;
  return (
    <Link
      to="/inbox/$conversationId"
      params={{ conversationId: c.id }}
      aria-current={selected ? "page" : undefined}
      aria-label={`${name}${unread ? `, ${c.unread_count} não lidas` : ""}${aiActive ? ", IA atendendo" : ""}`}
      data-selected={selected}
      className="row-wash group flex gap-3 rounded-xl px-3 py-3.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ContactAvatar
        name={name}
        src={c.avatar_url ?? contact?.avatar_url ?? null}
        platform={channel?.platform ?? null}
        isGroup={c.is_group}
        size={44}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 truncate text-[14px] text-foreground",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {c.is_group && <Users className="size-3.5 shrink-0 text-subtle" aria-label="Grupo" />}
            <span className="truncate">{name}</span>
          </span>
          <time
            dateTime={c.last_message_at ?? undefined}
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              unread ? "font-semibold text-foreground" : "text-subtle",
            )}
          >
            {formatListTime(c.last_message_at)}
          </time>
        </div>
        <p
          className={cn(
            "mt-0.5 line-clamp-1 text-[13px] leading-snug",
            unread ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {c.last_message_preview || "Sem mensagens ainda"}
        </p>
        {(hasMeta || unread) && (
          <div className="mt-2 flex min-h-5 items-center gap-2">
            <TempChip level={contact?.temperature} />
            {aiActive && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Bot className="size-3" aria-hidden /> IA atendendo
              </span>
            )}
            {owner && <span className="min-w-0 truncate text-[11px] text-subtle">{owner}</span>}
            {unread && (
              <span
                className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"
                aria-hidden
              >
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
