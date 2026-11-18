import { Globe, Megaphone } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describeOrigin, type TouchLike } from "@/features/contacts/origin";
import { cn } from "@/lib/utils";

// Selo "de onde veio": rede + anúncio/campanha; o detalhe (campanha, anúncio, público) no toque.
export function OriginChip({
  touch,
  className,
  size = "sm",
}: {
  touch: TouchLike | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const o = describeOrigin(touch);
  if (!o) return null;
  const chip = (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]",
        o.paid
          ? "border-primary/25 bg-primary/[0.06] text-foreground"
          : "border-border bg-surface-2 text-muted-foreground",
        className,
      )}
    >
      {o.paid ? (
        <Megaphone className="size-3 shrink-0" aria-hidden />
      ) : o.platform ? (
        <ChannelIcon platform={o.platform} size={12} />
      ) : (
        <Globe className="size-3 shrink-0" aria-hidden />
      )}
      <span className="truncate">
        <span className="sr-only">Veio de </span>
        {o.short}
      </span>
    </span>
  );
  if (!o.details.length) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Veio de ${o.short}: ver detalhes`}
          className={cn(
            "max-w-full rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            // o que esconde o selo esconde o botão junto (senão sobra botão vazio focável)
            className,
          )}
        >
          {chip}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="mb-1 font-semibold">De onde veio</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
          {o.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="opacity-70">{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
