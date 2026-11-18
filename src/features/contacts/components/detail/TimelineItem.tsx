import type { ReactNode } from "react";

import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  icon: ReactNode;
  tone: string;
  title: ReactNode;
  at: string;
  meta?: ReactNode;
  children?: ReactNode;
};

export function TimelineItem({ icon, tone, title, at, meta, children }: Props) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span
        className="absolute top-8 bottom-0 left-[13px] w-px bg-border last:hidden"
        aria-hidden
      />
      <span
        className={cn("z-[1] grid size-7 shrink-0 place-items-center rounded-full border", tone)}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[13px] font-medium">{title}</p>
          <time
            dateTime={at}
            title={formatDateTime(at)}
            className="text-[11px] text-subtle tabular-nums"
          >
            {formatRelative(at)}
          </time>
        </div>
        {meta && <p className="text-[11px] text-subtle">{meta}</p>}
        {children && (
          <div className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {children}
          </div>
        )}
      </div>
    </li>
  );
}
