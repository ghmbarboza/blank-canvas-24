import { CheckCircle2, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Aviso de erro do passo: o que aconteceu e o que fazer, lido por leitor de tela. */
export function StepError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex gap-2.5 rounded-xl border border-hot-line bg-hot-soft px-3 py-2.5 text-[13px] text-hot-fg"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** Faixa de "isto já está feito", no topo do passo. */
export function StepDone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13px]",
        className,
      )}
    >
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** Linha de conferência (feito ou esperando), usada no teste e no atendente. */
export function CheckLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px]">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
      ) : (
        <span
          className="mt-1 size-3.5 shrink-0 animate-pulse rounded-full border-2 border-foreground/30"
          aria-hidden
        />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {children}
        <span className="sr-only">{ok ? " (feito)" : " (esperando)"}</span>
      </span>
    </li>
  );
}

export interface StepProps {
  accountId: string;
  /** vai para o próximo passo que falta */
  onNext: () => void;
  /** fecha o passo a passo e abre uma tela da central */
  onGo: (to: string) => void;
}
