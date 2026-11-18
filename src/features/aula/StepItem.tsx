import { ArrowUpRight, Check, CircleCheck, LifeBuoy } from "lucide-react";

import { rich } from "./rich";
import type { AulaStep } from "./steps";
import { FOCUS_LIGHT, GOLD_BUTTON } from "./theme";

interface StepItemProps {
  step: AulaStep;
  index: number;
  total: number;
  done: boolean;
  current: boolean;
  last: boolean;
  onToggle: () => void;
}

export function StepItem({ step, index, total, done, current, last, onToggle }: StepItemProps) {
  const number = index + 1;
  const titleId = `passo-${step.id}-titulo`;

  return (
    <li
      id={`passo-${step.id}`}
      aria-labelledby={titleId}
      aria-current={current ? "step" : undefined}
      className="relative grid scroll-mt-24 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-x-8 lg:grid-cols-[8rem_minmax(0,1fr)]"
    >
      {/* Trilho da linha do tempo: número grande e a linha que desce até o próximo passo. */}
      <div aria-hidden="true" className="relative flex flex-col items-center">
        <span
          className={`flex size-11 items-center justify-center text-[2rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums transition-colors duration-300 sm:size-auto sm:text-[4.5rem] lg:text-[6rem] ${
            done ? "text-[var(--aula-line)]" : "text-[var(--aula-gold)]"
          }`}
        >
          {number}
        </span>
        {last ? null : (
          <span className="mt-3 w-px flex-1 bg-[var(--aula-line)]">
            <span
              className={`block h-full w-px origin-top bg-[var(--aula-gold)] transition-transform duration-500 ease-out motion-reduce:transition-none ${
                done ? "scale-y-100" : "scale-y-0"
              }`}
            />
          </span>
        )}
      </div>

      <div className={last ? "pb-0" : "pb-14 sm:pb-20"}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--aula-muted)] sm:pt-4 lg:pt-6">
          <span>
            Passo {number} de {total}
          </span>
          {done ? (
            <span className="inline-flex items-center gap-1 text-[var(--aula-gold-ink)]">
              <Check aria-hidden="true" strokeWidth={3} className="size-3.5" />
              Feito
            </span>
          ) : current ? (
            <span className="rounded-sm bg-[var(--aula-navy)] px-2 py-0.5 tracking-[0.14em] text-white">
              Você está aqui
            </span>
          ) : null}
        </p>

        <h3
          id={titleId}
          className="mt-2 text-balance text-[1.75rem] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-4xl"
        >
          {step.title}
        </h3>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-[var(--aula-muted)]">
          {step.why}
        </p>

        <ol className="mt-7 max-w-2xl space-y-3.5">
          {step.actions.map((action, actionIndex) => (
            <li key={action} className="flex gap-3.5 text-[1.0625rem] leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-[0.2rem] flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--aula-line)] text-xs font-bold text-[var(--aula-muted)]"
              >
                {String.fromCharCode(97 + actionIndex)}
              </span>
              <span>{rich(action)}</span>
            </li>
          ))}
        </ol>

        {step.cta ? (
          <a
            href={step.cta.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${GOLD_BUTTON} ${FOCUS_LIGHT} mt-8 w-full px-7 py-5 text-lg sm:w-auto sm:text-xl`}
          >
            {step.cta.label}
            <ArrowUpRight aria-hidden="true" className="size-5 shrink-0" />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        ) : null}

        {step.extras ? (
          <dl className="mt-7 max-w-2xl border-t border-[var(--aula-line)]">
            {step.extras.map((extra) => (
              <div
                key={extra.name}
                className="grid gap-x-6 gap-y-0.5 border-b border-[var(--aula-line)] py-3 sm:grid-cols-[13rem_minmax(0,1fr)]"
              >
                <dt className="font-bold">{extra.name}</dt>
                <dd className="text-[var(--aula-muted)]">{extra.what}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-8 max-w-2xl border-l-4 border-[var(--aula-gold)] bg-[var(--aula-gold-wash)] px-5 py-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--aula-gold-ink)]">
            <CircleCheck aria-hidden="true" className="size-4" />
            Deu certo quando
          </p>
          <p className="mt-1.5 text-[1.0625rem] font-semibold leading-relaxed">
            {rich(step.check)}
          </p>
        </div>

        <details className="group mt-3 max-w-2xl border border-[var(--aula-line)] bg-white open:pb-4">
          <summary
            className={`${FOCUS_LIGHT} flex cursor-pointer list-none items-center gap-2.5 px-5 py-3.5 font-bold transition-colors hover:bg-[var(--aula-line-soft)] [&::-webkit-details-marker]:hidden`}
          >
            <LifeBuoy aria-hidden="true" className="size-4 shrink-0 text-[var(--aula-gold-ink)]" />
            Travou neste passo?
            <span
              aria-hidden="true"
              className="ml-auto text-xl font-normal leading-none text-[var(--aula-muted)] transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
          </summary>
          <ul className="space-y-2.5 px-5 pt-1 leading-relaxed text-[var(--aula-muted)]">
            {step.stuck.map((tip) => (
              <li key={tip} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-[0.7rem] h-px w-3 shrink-0 bg-[var(--aula-gold-dark)]"
                />
                <span>{rich(tip)}</span>
              </li>
            ))}
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-[0.7rem] h-px w-3 shrink-0 bg-[var(--aula-gold-dark)]"
              />
              <span>
                Continua travado: levante a mão ou escreva no chat da aula dizendo o número do
                passo.
              </span>
            </li>
          </ul>
        </details>

        <button
          type="button"
          aria-pressed={done}
          onClick={onToggle}
          className={`${FOCUS_LIGHT} mt-6 inline-flex min-h-12 items-center gap-3 rounded-md border-2 px-5 py-2.5 text-base font-bold transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
            done
              ? "border-[var(--aula-navy)] bg-[var(--aula-navy)] text-white hover:bg-[var(--aula-navy-2)]"
              : "border-[var(--aula-navy)] bg-transparent text-[var(--aula-navy)] hover:bg-[var(--aula-navy)] hover:text-white"
          }`}
        >
          <span
            aria-hidden="true"
            className={`flex size-5 items-center justify-center rounded-sm border-2 border-current ${
              done ? "bg-[var(--aula-gold)] text-[var(--aula-navy)]" : ""
            }`}
          >
            {done ? <Check strokeWidth={4} className="size-3" /> : null}
          </span>
          {done ? `Passo ${number} feito` : `Marcar o passo ${number} como feito`}
        </button>
      </div>
    </li>
  );
}
