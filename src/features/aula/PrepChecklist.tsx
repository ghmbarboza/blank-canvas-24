import { ArrowUpRight, Check } from "lucide-react";

import { PREP_ITEMS } from "./steps";
import { FOCUS_LIGHT } from "./theme";
import type { Checklist } from "./useChecklist";

export function PrepChecklist({ checklist }: { checklist: Checklist }) {
  const ready = checklist.checked.length;
  const total = PREP_ITEMS.length;

  return (
    <section
      id="preparo"
      aria-labelledby="aula-preparo"
      className="mx-auto grid max-w-6xl scroll-mt-20 gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16 lg:py-24"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--aula-gold-ink)]">
          Antes de começar
        </p>
        <h2
          id="aula-preparo"
          className="mt-3 text-balance text-3xl font-extrabold leading-tight tracking-[-0.02em] sm:text-4xl"
        >
          O que ter aberto
        </h2>
        <p className="mt-4 max-w-sm leading-relaxed text-[var(--aula-muted)]">
          São quatro coisas. Marque cada uma quando estiver pronta. A página lembra o que você
          marcou, mesmo se fechar a aba.
        </p>
        <p aria-live="polite" className="mt-6 text-sm font-bold text-[var(--aula-ink)]">
          <span className="text-2xl font-extrabold tabular-nums">{ready}</span> de {total} prontos
        </p>
      </div>

      <ul className="border-t border-[var(--aula-line)]">
        {PREP_ITEMS.map((item) => {
          const inputId = `prep-${item.id}`;
          return (
            <li key={item.id} className="border-b border-[var(--aula-line)]">
              <div className="flex gap-4 py-5 sm:gap-5">
                <span className="relative mt-0.5 size-7 shrink-0">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checklist.isChecked(item.id)}
                    onChange={() => checklist.toggle(item.id)}
                    className={`peer absolute inset-0 size-full cursor-pointer appearance-none rounded-md border-2 border-[var(--aula-navy)] bg-white transition-colors duration-150 checked:border-[var(--aula-gold-dark)] checked:bg-[var(--aula-gold)] hover:border-[var(--aula-gold-dark)] ${FOCUS_LIGHT}`}
                  />
                  <Check
                    aria-hidden="true"
                    strokeWidth={3.5}
                    className="pointer-events-none absolute inset-0 m-auto size-4 scale-50 text-[var(--aula-navy)] opacity-0 transition-[transform,opacity] duration-150 peer-checked:scale-100 peer-checked:opacity-100 motion-reduce:transition-none"
                  />
                </span>
                <div className="min-w-0">
                  <label
                    htmlFor={inputId}
                    className="cursor-pointer text-lg font-bold leading-snug"
                  >
                    {item.title}
                  </label>
                  <p className="mt-1.5 leading-relaxed text-[var(--aula-muted)]">{item.detail}</p>
                  {item.link ? (
                    <a
                      href={item.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${FOCUS_LIGHT} mt-2.5 inline-flex items-center gap-1 rounded-sm text-sm font-bold text-[var(--aula-gold-ink)] underline decoration-[var(--aula-gold)] decoration-2 underline-offset-4 hover:text-[var(--aula-navy)]`}
                    >
                      {item.link.label}
                      <ArrowUpRight aria-hidden="true" className="size-4" />
                      <span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
