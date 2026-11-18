import { useEffect, useState } from "react";
import { AlarmClock, CheckCircle2, Timer } from "lucide-react";

import { cn } from "@/lib/utils";

import { slaState } from "./constants";

type SlaInput = Parameters<typeof slaState>[0];

// Selo do SLA que se atualiza sozinho a cada 30 s.
export function SlaChip({ ticket, className }: { ticket: SlaInput; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const s = slaState(ticket, now);
  const Icon = s.tone === "done" ? CheckCircle2 : s.tone === "late" ? AlarmClock : Timer;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-medium whitespace-nowrap tabular-nums",
        s.tone === "late" && "bg-danger/10 text-danger",
        s.tone === "warn" && "bg-primary-soft text-foreground ring-1 ring-primary/30",
        s.tone === "ok" && "bg-surface-2 text-muted-foreground",
        s.tone === "done" && "bg-surface-2 text-subtle",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden /> {s.label}
    </span>
  );
}
