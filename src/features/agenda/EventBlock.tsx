import { useState, type CSSProperties, type PointerEvent } from "react";

import { Video } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { formatSpan } from "./calendar";
import { EventDetails } from "./EventDetails";
import { eventAriaLabel, eventStateClass, eventTone } from "./eventTone";
import type { AgendaEvent } from "./types";

interface Props {
  event: AgendaEvent;
  variant: "grid" | "compact" | "chip" | "row";
  style?: CSSProperties;
  className?: string;
  isDragging?: boolean;
  onEdit: (event: AgendaEvent) => void;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>, event: AgendaEvent) => void;
  // Devolve true se o clique veio do fim de um arraste (não abre o detalhe).
  shouldIgnoreClick?: () => boolean;
}

export function EventBlock({
  event,
  variant,
  style,
  className,
  isDragging = false,
  onEdit,
  onPointerDown,
  shouldIgnoreClick,
}: Props) {
  const [open, setOpen] = useState(false);
  const span = formatSpan(event);
  const name = event.contact?.name ?? null;
  const hasLink = Boolean(event.row.meeting_url);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && shouldIgnoreClick?.()) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={eventAriaLabel(event, span)}
          style={style}
          onPointerDown={onPointerDown ? (e) => onPointerDown(e, event) : undefined}
          className={cn(
            "group min-w-0 cursor-pointer overflow-hidden rounded-lg border border-l-[3px] text-left transition-[box-shadow,transform,opacity] duration-150 ease-out hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            eventTone(event),
            eventStateClass(event),
            variant === "grid" && "flex flex-col gap-0.5 px-2 py-1.5",
            variant === "compact" && "flex items-center gap-1.5 px-2 py-0.5",
            variant === "chip" && "flex w-full items-center gap-1.5 px-1.5 py-0.5 text-[11px]",
            variant === "row" && "flex w-full items-center gap-3 px-3 py-2.5",
            isDragging && "z-30 opacity-80 shadow-drag",
            open && "ring-2 ring-primary-line",
            className,
          )}
        >
          {variant === "grid" && (
            <>
              <span className="flex min-w-0 items-start gap-1">
                <span
                  data-title
                  className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground"
                >
                  {event.row.title}
                </span>
                {hasLink && <Video className="mt-0.5 size-3 shrink-0 opacity-80" aria-hidden />}
              </span>
              {event.contact && (
                <span className="flex min-w-0 items-center gap-1 text-[11px] text-foreground/80">
                  {event.contact.source && event.contact.source in PLATFORM_LABEL && (
                    <ChannelIcon platform={event.contact.source} size={11} variant="mono" />
                  )}
                  <span className="truncate">{name ?? "Sem nome"}</span>
                </span>
              )}
              <span className="text-[11px] tabular-nums opacity-80">{span}</span>
            </>
          )}
          {variant === "compact" && (
            <>
              <span data-title className="truncate text-[11px] font-semibold text-foreground">
                {event.row.title}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums opacity-80">
                {span.split(" – ")[0]}
              </span>
            </>
          )}
          {variant === "chip" && (
            <>
              {!event.row.all_day && (
                <span className="shrink-0 tabular-nums opacity-80">{span.split(" – ")[0]}</span>
              )}
              <span data-title className="truncate font-medium text-foreground">
                {event.row.title}
              </span>
            </>
          )}
          {variant === "row" && (
            <>
              {event.contact && (
                <ContactAvatar
                  name={name}
                  src={event.contact.avatar_url}
                  platform={event.contact.source}
                  size={28}
                />
              )}
              <span className="min-w-0 flex-1">
                <span
                  data-title
                  className="block truncate text-[13px] font-semibold text-foreground"
                >
                  {event.row.title}
                </span>
                {name && (
                  <span className="block truncate text-[12px] text-muted-foreground">{name}</span>
                )}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums">{span}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 rounded-xl p-4 shadow-pop"
        align="start"
        collisionPadding={16}
      >
        <EventDetails
          event={event}
          onDone={() => setOpen(false)}
          onEdit={() => {
            setOpen(false);
            onEdit(event);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
