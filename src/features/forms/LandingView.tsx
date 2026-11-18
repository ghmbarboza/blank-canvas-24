import { ChevronDown, Quote } from "lucide-react";

import { PublicFormView } from "./PublicFormView";
import type { LandingBlock, PublicForm } from "./types";

interface Props {
  title: string;
  blocks: LandingBlock[];
  form: PublicForm | null;
  accent?: string;
  preview?: boolean;
}

// Renderização da landing page por blocos (página pública e prévia do construtor).
export function LandingView({ title, blocks, form, accent = "#0A1F3B", preview = false }: Props) {
  const scrollToForm = () =>
    document.getElementById("lp-form")?.scrollIntoView({ behavior: "smooth" });
  return (
    <div className="bg-background text-foreground">
      {blocks.length === 0 && (
        <section className="px-6 py-24 text-center">
          <h1 className="font-display text-4xl font-medium">{title}</h1>
        </section>
      )}
      {blocks.map((b) => {
        switch (b.type) {
          case "hero":
            return (
              <section
                key={b.id}
                className="relative overflow-hidden px-6 py-20 text-white sm:py-28"
                style={{ background: accent }}
              >
                <div
                  className="hero-orb pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-white/10 blur-3xl"
                  aria-hidden
                />
                <div className="relative mx-auto max-w-3xl text-center">
                  <h1 className="font-display text-[34px] leading-tight font-medium sm:text-[48px]">
                    {b.title}
                  </h1>
                  {b.subtitle && (
                    <p className="mx-auto mt-4 max-w-2xl text-[17px] text-white/75">{b.subtitle}</p>
                  )}
                  {b.cta && (
                    <button
                      type="button"
                      onClick={scrollToForm}
                      className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-semibold"
                      style={{ color: accent }}
                    >
                      {b.cta} <ChevronDown className="size-4" />
                    </button>
                  )}
                </div>
              </section>
            );
          case "features":
            return (
              <section key={b.id} className="mx-auto max-w-5xl px-6 py-16">
                {b.title && (
                  <h2 className="mb-8 text-center font-display text-[28px] font-medium">
                    {b.title}
                  </h2>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  {b.items.map((it, i) => (
                    <div key={i} className="rounded-[24px] border border-border bg-surface p-6">
                      <p className="text-[16px] font-semibold">{it.title}</p>
                      <p className="mt-2 text-[14px] text-muted-foreground">{it.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          case "text":
            return (
              <section key={b.id} className="mx-auto max-w-2xl px-6 py-12">
                {b.title && (
                  <h2 className="mb-4 font-display text-[26px] font-medium">{b.title}</h2>
                )}
                <p className="text-[16px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {b.body}
                </p>
              </section>
            );
          case "form":
            return (
              <section key={b.id} id="lp-form" className="px-6 py-16">
                <div className="mx-auto max-w-md rounded-[28px] border border-border bg-surface p-6 sm:p-8">
                  {b.title && (
                    <h2 className="mb-1 font-display text-[22px] font-medium">{b.title}</h2>
                  )}
                  {b.subtitle && (
                    <p className="mb-4 text-[14px] text-muted-foreground">{b.subtitle}</p>
                  )}
                  {form ? (
                    <PublicFormView
                      form={{
                        ...form,
                        title: "",
                        description: null,
                        theme: { ...form.theme, accent },
                      }}
                      preview={preview}
                      source="landing"
                    />
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      Escolha um formulário para esta página.
                    </p>
                  )}
                </div>
              </section>
            );
          case "testimonial":
            return (
              <section key={b.id} className="mx-auto max-w-3xl px-6 py-14 text-center">
                <Quote className="mx-auto size-8 text-subtle" aria-hidden />
                <p className="mt-4 font-display text-[22px] leading-snug">“{b.quote}”</p>
                <p className="mt-4 text-[14px] text-muted-foreground">
                  {b.author}
                  {b.role && ` · ${b.role}`}
                </p>
              </section>
            );
          case "faq":
            return (
              <section key={b.id} className="mx-auto max-w-2xl px-6 py-14">
                {b.title && (
                  <h2 className="mb-6 text-center font-display text-[26px] font-medium">
                    {b.title}
                  </h2>
                )}
                <div className="divide-y divide-border rounded-[24px] border border-border bg-surface">
                  {b.items.map((it, i) => (
                    <details key={i} className="group px-5 py-4">
                      <summary className="cursor-pointer list-none text-[15px] font-medium">
                        {it.q}
                      </summary>
                      <p className="mt-2 text-[14px] text-muted-foreground">{it.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            );
          case "cta":
            return (
              <section key={b.id} className="px-6 py-16">
                <div
                  className="mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-[32px] px-6 py-12 text-center text-white"
                  style={{ background: accent }}
                >
                  <h2 className="font-display text-[28px] font-medium">{b.title}</h2>
                  <button
                    type="button"
                    onClick={scrollToForm}
                    className="rounded-full bg-white px-6 py-3 text-[15px] font-semibold"
                    style={{ color: accent }}
                  >
                    {b.button}
                  </button>
                </div>
              </section>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
