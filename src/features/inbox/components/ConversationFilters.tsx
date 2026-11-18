import type { ReactNode } from "react";
import { MailOpen, Bot, Tag } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { cn } from "@/lib/utils";
import {
  SCOPE_LABEL,
  SCOPE_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  type ConversationStatus,
  type InboxFilters,
  type InboxScope,
} from "../types";

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}

function Chip({ active, onClick, children, label }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...(label ? { "aria-label": label, title: label } : {})}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
        active
          ? "border-primary-line bg-primary-soft text-primary"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

interface Props {
  filters: InboxFilters;
  counts: Record<ConversationStatus, number>;
  scopeCounts: Record<InboxScope, number>;
  platforms: string[];
  /** etiquetas das conversas carregadas (#64) */
  tags?: string[];
  onChange: (next: InboxFilters) => void;
}

export function ConversationFilters({
  filters,
  counts,
  scopeCounts,
  platforms,
  tags = [],
  onChange,
}: Props) {
  return (
    <div className="space-y-2.5">
      <div
        role="radiogroup"
        aria-label="Situação da conversa"
        className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5"
      >
        {STATUS_ORDER.map((s) => {
          const active = filters.status === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ ...filters, status: s })}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-surface text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {STATUS_LABEL[s]}
              {counts[s] > 0 && (
                <span className="text-[11px] text-subtle tabular-nums">{counts[s]}</span>
              )}
            </button>
          );
        })}
      </div>

      <div role="radiogroup" aria-label="De quem é a conversa" className="flex flex-wrap gap-1.5">
        {SCOPE_ORDER.map((s) => {
          const active = filters.scope === s;
          const n = scopeCounts[s];
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ ...filters, scope: s })}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-[background-color,color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
                active
                  ? "border-primary bg-primary-soft text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {s === "ai" && <Bot className="size-3" aria-hidden />}
              {SCOPE_LABEL[s]}
              {s !== "all" && n > 0 && (
                <span
                  className={cn("tabular-nums", active ? "text-muted-foreground" : "text-subtle")}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        <Chip
          active={filters.unread}
          onClick={() => onChange({ ...filters, unread: !filters.unread })}
        >
          <MailOpen className="size-3.5" aria-hidden /> Não lidas
        </Chip>
        {platforms.length > 1 &&
          platforms.map((p) => (
            <Chip
              key={p}
              active={filters.platform === p}
              label={`Só ${PLATFORM_LABEL[p] ?? p}`}
              onClick={() => onChange({ ...filters, platform: filters.platform === p ? null : p })}
            >
              <ChannelIcon platform={p} size={14} />
              <span className="hidden sm:inline">{PLATFORM_LABEL[p] ?? p}</span>
            </Chip>
          ))}
        {tags.map((tag) => (
          <Chip
            key={`tag-${tag}`}
            active={filters.tag === tag}
            label={`Só a etiqueta ${tag}`}
            onClick={() => onChange({ ...filters, tag: filters.tag === tag ? null : tag })}
          >
            <Tag className="size-3" aria-hidden />
            {tag}
          </Chip>
        ))}
      </div>
    </div>
  );
}
