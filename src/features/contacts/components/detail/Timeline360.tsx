import {
  Bot,
  Briefcase,
  CalendarDays,
  ClipboardList,
  History,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Ticket,
  Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { activityMeta } from "./activityMeta";
import { useTimeline360 } from "./hooks";
import { TIMELINE_FILTERS } from "./timeline-filters";
import { TimelineItem } from "./TimelineItem";

export interface TimelineRow {
  kind: string;
  ref_id: string;
  at: string;
  title: string;
  body: string | null;
  meta: Record<string, unknown>;
}

const KIND_META: Record<string, { icon: LucideIcon; tone: string }> = {
  message: { icon: MessageSquare, tone: "bg-surface-2 text-muted-foreground border-border" },
  email: { icon: Mail, tone: "bg-surface-2 text-muted-foreground border-border" },
  call: { icon: Phone, tone: "bg-primary-soft text-primary border-primary-line" },
  meeting: { icon: Video, tone: "bg-primary text-primary-foreground border-primary" },
  event: { icon: CalendarDays, tone: "bg-surface-2 text-muted-foreground border-border" },
  deal: { icon: Briefcase, tone: "bg-surface-2 text-foreground border-border" },
  proposal: { icon: Briefcase, tone: "bg-surface-2 text-foreground border-border" },
  payment: { icon: Briefcase, tone: "bg-primary-soft text-primary border-primary-line" },
  classification: { icon: Bot, tone: "bg-primary-soft text-primary border-primary-line" },
  consent: { icon: ShieldCheck, tone: "bg-surface-2 text-muted-foreground border-border" },
  ticket: { icon: Ticket, tone: "bg-surface-2 text-muted-foreground border-border" },
  form: { icon: ClipboardList, tone: "bg-primary-soft text-primary border-primary-line" },
  automation: { icon: Workflow, tone: "bg-surface-2 text-muted-foreground border-border" },
};

// Linha do tempo 360: tudo o que aconteceu com a pessoa, de qualquer canal, numa linha só (RPC contact_timeline).
export function Timeline360({ contactId }: { contactId: string }) {
  const [filter, setFilter] = useState("all");
  const q = useTimeline360(contactId);
  const rows = useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);
  const active = TIMELINE_FILTERS.find((f) => f.id === filter)!;
  const visible = active.kinds.length ? rows.filter((r) => active.kinds.includes(r.kind)) : rows;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of TIMELINE_FILTERS)
      m.set(
        f.id,
        f.kinds.length ? rows.filter((r) => f.kinds.includes(r.kind)).length : rows.length,
      );
    return m;
  }, [rows]);

  return (
    <div>
      <div
        className="mb-4 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Filtrar linha do tempo"
      >
        {TIMELINE_FILTERS.filter((f) => f.id === "all" || (counts.get(f.id) ?? 0) > 0).map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors",
              filter === f.id
                ? "border-primary bg-primary-soft text-foreground"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts.get(f.id)}</span>
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Loader2 className="mx-auto my-10 animate-spin text-subtle" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nada por aqui ainda"
          description="Mensagens, tarefas, chamados e leituras da IA aparecem nesta linha."
          className="py-10"
        />
      ) : (
        <ol>
          {visible.map((r) => (
            <TimelineEntry key={`${r.kind}-${r.ref_id}`} r={r} />
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {q.isFetchingNextPage && <Loader2 className="animate-spin" />} Carregar mais
        </Button>
      )}
    </div>
  );
}

export function TimelineEntry({ r, who }: { r: TimelineRow; who?: string | null }) {
  const m = r.meta ?? {};
  let meta = KIND_META[r.kind] ?? KIND_META["event"]!;
  if (r.kind === "activity") {
    const am = activityMeta(String(m["type"] ?? "note"));
    meta = { icon: am.icon, tone: am.tone };
  }
  const Icon = meta.icon;
  const platform = typeof m["platform"] === "string" ? (m["platform"] as string) : null;
  let sub: React.ReactNode = null;
  if (r.kind === "message" && platform) {
    sub = (
      <span className="inline-flex items-center gap-1">
        <ChannelIcon platform={platform as never} className="size-3" />{" "}
        {PLATFORM_LABEL[platform as keyof typeof PLATFORM_LABEL] ?? platform}
        {m["sender_type"] === "ai" && " · IA"}
        {m["is_private"] === true && " · nota interna"}
      </span>
    );
  } else if (r.kind === "deal" && typeof m["value"] === "number") {
    sub = `${formatMoney(m["value"] as number)} · ${m["status"] === "won" ? "fidelizado" : m["status"] === "lost" ? "perdido" : "na carteira"}`;
  } else if (r.kind === "classification") {
    sub = "Resumo atualizado pela IA";
  } else if (r.kind === "call" || r.kind === "meeting") {
    const secs = Number(m["duration_seconds"] ?? 0);
    sub = secs ? `${Math.round(secs / 60)} min` : null;
  }
  return (
    <TimelineItem
      icon={<Icon className="size-3.5" />}
      tone={meta.tone}
      title={r.title}
      at={r.at}
      meta={
        who ? (
          <>
            <span className="font-medium text-foreground">{who}</span>
            {sub ? <> · {sub}</> : null}
          </>
        ) : (
          (sub ?? undefined)
        )
      }
    >
      {r.body ? <span className="line-clamp-4">{r.body}</span> : null}
    </TimelineItem>
  );
}
