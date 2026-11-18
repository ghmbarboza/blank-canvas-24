import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Rascunho", tone: "border-border bg-surface-2 text-muted-foreground" },
  scheduled: { label: "Agendada", tone: "border-primary-line bg-primary-soft text-foreground" },
  sending: { label: "Enviando", tone: "border-primary/30 bg-primary-soft text-foreground" },
  sent: { label: "Enviada", tone: "border-border bg-surface text-foreground" },
  paused: { label: "Pausada", tone: "border-note-line bg-note text-note-fg" },
  canceled: { label: "Cancelada", tone: "border-border bg-surface-2 text-subtle line-through" },
};

// Pílula do DS: bolinha só em "Enviando", que é o único status ao vivo.
export function CampaignStatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS["draft"]!;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        s.tone,
      )}
    >
      {status === "sending" && (
        <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
      )}
      {s.label}
    </span>
  );
}
