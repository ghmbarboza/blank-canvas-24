import { cn } from "@/lib/utils";

// Monograma oficial da Viver de IA (design system). A versão branca entra no tema escuro.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-grid size-8 place-items-center", className)}>
      <img
        src="/brand/via-monogram.png"
        alt="Viver de IA"
        width={434}
        height={239}
        className="w-full object-contain dark:hidden"
      />
      <img
        src="/brand/via-monogram-white.png"
        alt="Viver de IA"
        width={434}
        height={239}
        className="hidden w-full object-contain dark:block"
      />
    </span>
  );
}

// Assinatura do produto: monograma + nome, com o crédito da casa.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Logo className="w-11" />
      <span className="h-6 w-px bg-border-strong" aria-hidden />
      <span className="leading-none">
        <span className="block text-[15px] font-semibold tracking-tight text-foreground">
          Nexus One
        </span>
        <span className="mt-1 block text-[10px] font-medium tracking-[0.18em] text-subtle uppercase">
          Viver de IA
        </span>
      </span>
    </span>
  );
}
