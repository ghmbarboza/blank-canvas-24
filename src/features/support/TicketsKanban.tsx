import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { TicketRow } from "./api";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  slaState,
  type TicketPriority,
  type TicketStatus,
} from "./constants";
import { SlaChip } from "./SlaChip";
import { TicketChannel } from "./TicketChannel";

const KANBAN: TicketStatus[] = ["open", "pending", "waiting_customer", "resolved"];

interface Props {
  tickets: TicketRow[];
  names: Map<string, string>;
  onOpen: (id: string) => void;
  onMove: (ticket: TicketRow, to: TicketStatus) => void;
}

// Quadro por status. dnd-kit em vez do drag nativo do HTML: funciona no toque (segurar 200 ms)
// e no teclado (espaço pega, setas movem, espaço solta).
export function TicketsKanban({ tickets, names, onOpen, onMove }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id as TicketStatus | undefined;
    const t = tickets.find((x) => x.id === e.active.id);
    if (t && to && t.status !== to) onMove(t, to);
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {KANBAN.map((col) => (
          <Column
            key={col}
            status={col}
            items={tickets.filter((t) => t.status === col)}
            onOpen={onOpen}
            names={names}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  items,
  onOpen,
  names,
}: {
  status: TicketStatus;
  items: TicketRow[];
  onOpen: (id: string) => void;
  names: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const done = status === "resolved";
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]}: ${items.length}`}
      className={cn(
        "flex w-[min(19rem,calc(100vw-3rem))] shrink-0 snap-start flex-col rounded-[20px] p-1.5 transition-colors md:w-auto md:min-w-0",
        isOver && "bg-primary-soft ring-2 ring-primary-line",
      )}
    >
      <header className="mb-2 flex items-center justify-between px-2 pt-1">
        <h3 className="text-[13px] font-medium">{STATUS_LABEL[status]}</h3>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </header>
      <ul className="min-h-24 space-y-2">
        {items.slice(0, 80).map((t) => (
          <Card
            key={t.id}
            ticket={t}
            onOpen={onOpen}
            muted={done}
            owner={t.owner_user_id ? names.get(t.owner_user_id) : undefined}
          />
        ))}
        {items.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-subtle">
            {done ? "Nada resolvido ainda" : "Arraste um chamado para cá"}
          </li>
        )}
      </ul>
    </section>
  );
}

function Card({
  ticket: t,
  onOpen,
  muted,
  owner,
}: {
  ticket: TicketRow;
  onOpen: (id: string) => void;
  muted: boolean;
  owner: string | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const late = slaState(t).tone === "late";
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-roledescription="chamado arrastável"
      aria-label={`Chamado ${t.number}: ${t.subject}`}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(t.id);
      }}
      className={cn(
        "lift cursor-pointer touch-manipulation rounded-2xl border bg-surface p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
        late ? "border-danger/40" : "border-border",
        muted && "opacity-70",
        isDragging && "relative z-10 cursor-grabbing opacity-90 shadow-drag",
      )}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {t.contact?.name ?? t.contact?.email ?? "Sem cliente"}
        </p>
        <TicketChannel ticket={t} className="mt-0.5" />
      </div>
      <p
        className={cn(
          "mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground",
          muted && "line-through decoration-border-strong",
        )}
      >
        {t.subject}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <PriorityPill p={t.priority as TicketPriority} />
        {muted ? (
          <span className="text-[11px] text-subtle">
            {t.resolved_at ? `Resolvido ${formatRelative(t.resolved_at)}` : "Resolvido"}
          </span>
        ) : (
          <SlaChip ticket={t} />
        )}
        <span className="ml-auto font-mono text-[11px] text-subtle">#{t.number}</span>
        {owner && (
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold"
            title={`Responsável: ${owner}`}
            aria-label={`Responsável: ${owner}`}
          >
            {initials(owner)}
          </span>
        )}
      </div>
    </li>
  );
}

// Prioridade em pílula: a rampa é de navy (urgente cheio), nunca coral; coral é só atraso.
export function PriorityPill({ p, className }: { p: TicketPriority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-medium whitespace-nowrap",
        p === "urgent" && "bg-primary text-primary-foreground",
        p === "high" && "bg-primary-soft text-foreground ring-1 ring-primary-line",
        p === "normal" && "bg-surface-2 text-muted-foreground",
        p === "low" && "bg-surface-2 text-subtle",
        className,
      )}
    >
      {PRIORITY_LABEL[p] ?? p}
    </span>
  );
}

export function PriorityDot({ p }: { p: TicketPriority }) {
  return (
    <span
      role="img"
      aria-label={`Prioridade ${PRIORITY_LABEL[p]}`}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        p === "urgent" && "bg-primary",
        p === "high" && "bg-primary/60",
        p === "normal" && "bg-border-strong",
        p === "low" && "bg-border",
      )}
    />
  );
}
