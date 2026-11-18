import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

// Estado vazio que ensina o próximo passo, nunca uma tela em branco.
export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "ds-empty-state flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-border bg-surface">
        <Icon className="size-5 text-primary" aria-hidden />
      </div>
      <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] text-balance text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
