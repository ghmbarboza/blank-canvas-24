import { BRAND } from "@/lib/brand";

import { STEPS } from "./steps";
import { FOCUS_DARK } from "./theme";

interface ProgressBarProps {
  doneCount: number;
  /** Índice do primeiro passo ainda não feito; null quando todos estão feitos. */
  currentIndex: number | null;
}

// Barra fina que acompanha a rolagem: diz em que passo o aluno está e quanto falta.
export function ProgressBar({ doneCount, currentIndex }: ProgressBarProps) {
  const total = STEPS.length;
  const current = currentIndex === null ? null : STEPS[currentIndex];
  const label = current
    ? `Passo ${(currentIndex ?? 0) + 1} de ${total}`
    : `${total} de ${total} feitos`;
  const detail = current ? current.title : "Seu pós-venda está no ar";
  const href = current ? `#passo-${current.id}` : "#depois";

  return (
    <nav
      aria-label="Andamento da aula"
      className="sticky top-0 z-40 bg-[var(--aula-navy)]/95 text-white backdrop-blur-sm"
    >
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-5 sm:px-8">
        <span className="hidden text-sm font-extrabold tracking-tight sm:inline">{BRAND.name}</span>
        <span
          aria-hidden="true"
          className="hidden h-4 w-px bg-[var(--aula-navy-line)] sm:inline-block"
        />
        <a
          href={href}
          className={`${FOCUS_DARK} flex min-w-0 items-baseline gap-2.5 rounded-sm text-sm transition-colors hover:text-[var(--aula-gold)]`}
        >
          <span
            aria-live="polite"
            className="shrink-0 font-extrabold tabular-nums text-[var(--aula-gold)]"
          >
            {label}
          </span>
          <span className="truncate font-medium text-[var(--aula-on-navy-muted)]">{detail}</span>
        </a>
      </div>
      <div
        role="progressbar"
        aria-label="Passos feitos"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={doneCount}
        aria-valuetext={`${doneCount} de ${total} passos feitos`}
        className="h-[3px] bg-[var(--aula-navy-line)]"
      >
        <div
          className="h-full origin-left bg-[var(--aula-gold)] transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${doneCount / total})` }}
        />
      </div>
    </nav>
  );
}
