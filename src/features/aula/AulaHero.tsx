import { ArrowDown, Bot, HeartPulse, Repeat, Star, type LucideIcon } from "lucide-react";

import { BRAND } from "@/lib/brand";

import { TAKEAWAYS } from "./steps";
import { FOCUS_DARK, GOLD_BUTTON } from "./theme";

const TAKEAWAY_ICONS: readonly LucideIcon[] = [Bot, Star, HeartPulse, Repeat];

// Trama discreta do topo: linhas finas e um brilho dourado no canto.
const HERO_TEXTURE = {
  backgroundImage:
    "radial-gradient(60rem 30rem at 85% -10%, rgb(185 145 91 / 0.22), transparent 60%), " +
    "linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px)",
  backgroundSize: "auto, 6rem 100%",
};

// Só desliza (sem esmaecer): o texto fica legível mesmo se a animação atrasar.
const RISE = "animate-in slide-in-from-bottom-3 duration-700 ease-out motion-reduce:animate-none";

export function AulaHero() {
  return (
    <header
      className="relative overflow-hidden bg-[var(--aula-navy)] text-[var(--aula-on-navy)]"
      style={HERO_TEXTURE}
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-10 sm:px-8 sm:pb-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16 lg:pb-28 lg:pt-14">
        <div className={RISE}>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-extrabold tracking-tight">{BRAND.name}</span>
            <span className="text-sm font-medium text-[var(--aula-on-navy-muted)]">
              {BRAND.tagline}
            </span>
          </p>

          <p className="mt-12 text-xs font-bold uppercase tracking-[0.22em] text-[var(--aula-gold)] lg:mt-20">
            Aula ao vivo · 2 horas · você faz junto
          </p>
          <h1 className="mt-4 text-balance text-[2.25rem] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-[3.75rem]">
            Em duas horas você sai com o seu pós-venda no WhatsApp{" "}
            <span className="text-[var(--aula-gold)]">funcionando.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--aula-on-navy-muted)]">
            Deixe esta página aberta no notebook. Ela acompanha a aula inteira: sete passos, cada um
            com o que fazer, o que deve aparecer na tela e o que fazer se travar.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a href="#preparo" className={`${GOLD_BUTTON} ${FOCUS_DARK} px-6 py-3.5 text-base`}>
              Ver o que ter aberto
              <ArrowDown aria-hidden="true" className="size-4" />
            </a>
            <a
              href="#passos"
              className={`${FOCUS_DARK} rounded-sm text-base font-bold text-white underline decoration-[var(--aula-gold)] decoration-2 underline-offset-[6px] transition-colors hover:text-[var(--aula-gold)]`}
            >
              Já tenho tudo, ir aos passos
            </a>
          </div>
        </div>

        <section
          aria-labelledby="aula-leva"
          className={`${RISE} self-end border-t-2 border-[var(--aula-gold)] pt-6`}
        >
          <h2
            id="aula-leva"
            className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--aula-on-navy-muted)]"
          >
            O que você leva para casa
          </h2>
          <ul className="mt-2">
            {TAKEAWAYS.map((item, index) => {
              const Icon = TAKEAWAY_ICONS[index] ?? Bot;
              return (
                <li
                  key={item.title}
                  className="flex gap-4 border-b border-[var(--aula-navy-line)] py-5 last:border-b-0"
                >
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-[var(--aula-gold)]"
                  />
                  <div>
                    <p className="text-lg font-bold leading-snug">{item.title}</p>
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-[var(--aula-on-navy-muted)]">
                      {item.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </header>
  );
}
