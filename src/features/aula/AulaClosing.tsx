import { ShieldAlert } from "lucide-react";

import { BRAND } from "@/lib/brand";

import { AFTER_CLASS, CAUTIONS } from "./steps";

export function Cautions() {
  return (
    <section
      aria-labelledby="aula-cuidados"
      className="bg-[var(--aula-navy)] text-[var(--aula-on-navy)]"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16 lg:py-24">
        <div>
          <ShieldAlert aria-hidden="true" className="size-8 text-[var(--aula-gold)]" />
          <h2
            id="aula-cuidados"
            className="mt-5 text-balance text-3xl font-extrabold leading-tight tracking-[-0.02em] sm:text-4xl"
          >
            Cuidados que valem mais que tudo
          </h2>
          <p className="mt-4 max-w-sm leading-relaxed text-[var(--aula-on-navy-muted)]">
            O WhatsApp é o canal mais pessoal que a sua empresa tem. Quatro regras para não perder o
            número nem a confiança do cliente.
          </p>
        </div>
        <ol className="border-t border-[var(--aula-navy-line)]">
          {CAUTIONS.map((item, index) => (
            <li
              key={item.title}
              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 border-b border-[var(--aula-navy-line)] py-5"
            >
              <span
                aria-hidden="true"
                className="pt-0.5 text-sm font-extrabold tabular-nums text-[var(--aula-gold)]"
              >
                0{index + 1}
              </span>
              <div>
                <p className="text-lg font-bold leading-snug">{item.title}</p>
                <p className="mt-1 leading-relaxed text-[var(--aula-on-navy-muted)]">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function AfterClass() {
  return (
    <section
      id="depois"
      aria-labelledby="aula-depois"
      className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24"
    >
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--aula-gold-ink)]">
        Depois da aula
      </p>
      <h2
        id="aula-depois"
        className="mt-3 max-w-2xl text-balance text-3xl font-extrabold leading-tight tracking-[-0.02em] sm:text-4xl"
      >
        O que ligar em casa, com calma
      </h2>
      <ul className="mt-10 grid gap-x-12 border-t border-[var(--aula-line)] md:grid-cols-2">
        {AFTER_CLASS.map((item) => (
          <li key={item.title} className="border-b border-[var(--aula-line)] py-6">
            <p className="text-xl font-extrabold leading-snug tracking-[-0.01em]">{item.title}</p>
            <p className="mt-2 max-w-md leading-relaxed text-[var(--aula-muted)]">{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AulaFooter() {
  return (
    <footer className="border-t border-[var(--aula-line)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-8 text-sm sm:px-8">
        <p className="font-bold">Aula ao vivo do G4 Educação</p>
        <p className="text-[var(--aula-muted)]">
          <span className="font-extrabold text-[var(--aula-ink)]">{BRAND.name}</span> ·{" "}
          {BRAND.tagline}
        </p>
      </div>
    </footer>
  );
}
