import {
  ArrowRightLeft,
  CalendarDays,
  CheckSquare,
  Mail,
  Phone,
  Bot,
  StickyNote,
  type LucideIcon,
} from "lucide-react";

export const ACTIVITY_META: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  note: { icon: StickyNote, label: "Nota", tone: "bg-note text-note-fg border-note-line" },
  call: { icon: Phone, label: "Ligação", tone: "bg-surface-2 text-muted-foreground border-border" },
  task: {
    icon: CheckSquare,
    label: "Tarefa",
    tone: "bg-surface-2 text-muted-foreground border-border",
  },
  email: { icon: Mail, label: "E-mail", tone: "bg-surface-2 text-muted-foreground border-border" },
  meeting: {
    icon: CalendarDays,
    label: "Reunião",
    tone: "bg-surface-2 text-muted-foreground border-border",
  },
  stage_change: {
    icon: ArrowRightLeft,
    label: "Mudou de etapa",
    tone: "bg-surface-2 text-muted-foreground border-border",
  },
  ai: { icon: Bot, label: "IA", tone: "bg-primary-soft text-primary border-primary-line" },
};

export function activityMeta(type: string) {
  return ACTIVITY_META[type] ?? ACTIVITY_META["note"]!;
}
