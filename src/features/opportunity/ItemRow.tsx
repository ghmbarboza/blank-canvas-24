import { ArrowUpRight, Check, Puzzle, Bot, Target, X } from "lucide-react";

import { BILLING_LABEL } from "@/features/catalog/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { KIND_LABEL, type DealItem, type ItemKind, type ItemStatus } from "./lib";

const KIND_ICON: Record<ItemKind, typeof Target> = {
  core: Target,
  upsell: ArrowUpRight,
  cross_sell: Puzzle,
};

interface Props {
  item: DealItem;
  onStatus?: ((status: ItemStatus) => void) | undefined;
  busy?: boolean;
  compact?: boolean;
}

// Linha de item da oportunidade: tipo, motivo da IA, valor e aceitar/recusar quando é sugestão.
export function ItemRow({ item, onStatus, busy = false, compact = false }: Props) {
  const kind = (item.kind as ItemKind) ?? "core";
  const status = item.status as ItemStatus;
  const Icon = KIND_ICON[kind];
  const recurring = item.billing === "monthly";
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
        status === "suggested"
          ? "border border-dashed border-border-strong bg-surface"
          : "bg-surface-2/60",
        status === "declined" && "opacity-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
          kind === "core"
            ? "bg-primary text-primary-foreground"
            : "bg-primary-soft text-foreground",
        )}
        title={KIND_LABEL[kind]}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] font-medium",
              status === "declined" && "line-through",
            )}
          >
            {item.name}
          </p>
          <p className="shrink-0 text-[13px] font-semibold tabular-nums">
            {formatMoney(item.line_total)}
          </p>
        </div>
        <p className="text-[11px] text-subtle tabular-nums">
          {KIND_LABEL[kind]}
          {" · "}
          {Number(item.quantity) !== 1 && `${Number(item.quantity)} × `}
          {formatMoney(item.unit_price)} {BILLING_LABEL[item.billing]}
          {Number(item.discount_pct) > 0 && ` · −${Number(item.discount_pct)}%`}
          {recurring && " · 12 meses"}
        </p>
        {!compact && item.reason && (
          <p className="mt-1 flex items-start gap-1 text-[12px] text-muted-foreground">
            {item.source === "ai" && <Bot className="mt-0.5 size-3 shrink-0" aria-hidden />}
            <span className="line-clamp-2">{item.reason}</span>
          </p>
        )}
      </div>
      {onStatus && status === "suggested" && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("accepted")}
            aria-label={`Incluir ${item.name}`}
            className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("declined")}
            aria-label={`Descartar ${item.name}`}
            className="grid size-7 place-items-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {onStatus && status === "declined" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus("suggested")}
          className="shrink-0 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Desfazer
        </button>
      )}
    </li>
  );
}
