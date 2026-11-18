import type { ReactNode } from "react";

// Moldura das páginas públicas (central de ajuda, CSAT, NPS): sem login, leve e legível no celular.
export function PublicShell({
  company,
  children,
  wide = false,
}: {
  company?: string | undefined;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="relative overflow-hidden bg-[#001F35] px-4 py-8 text-white sm:px-6">
        <div
          className="hero-orb pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div className={wide ? "mx-auto max-w-4xl" : "mx-auto max-w-xl"}>
          <p className="text-[12px] font-medium tracking-[0.18em] text-white/60 uppercase">
            {company || "Atendimento"}
          </p>
        </div>
      </header>
      <main
        className={
          wide
            ? "mx-auto -mt-4 max-w-4xl px-4 pb-16 sm:px-6"
            : "mx-auto -mt-4 max-w-xl px-4 pb-16 sm:px-6"
        }
      >
        {children}
      </main>
      <footer className="pb-8 text-center text-[11px] text-subtle">Atendimento com Vínculo</footer>
    </div>
  );
}
