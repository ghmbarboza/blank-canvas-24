import { useId } from "react";

import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const NAVY = "#001F35";
const GOLD = "#B9915B";
const GOLD_LIGHT = "#D9BC8C";

// Símbolo da Central de CS: dois elos dourados entrelaçados sobre azul-marinho. O mesmo desenho de
// public/brand/vinculo-icon.svg (favicon). Funciona em fundo claro e escuro: a placa navy é dele.
export function Logo({ className, title }: { className?: string; title?: string }) {
  const id = useId();
  const up = `${id}-up`;
  const down = `${id}-down`;
  const over = `${id}-over`;
  return (
    <span className={cn("inline-grid aspect-square w-8 shrink-0 place-items-center", className)}>
      <svg
        viewBox="0 0 48 48"
        className="block h-full w-full"
        role="img"
        aria-label={title ?? BRAND.name}
      >
        <defs>
          <clipPath id={up}>
            <circle cx="24" cy="17.74" r="3.5" />
          </clipPath>
          <clipPath id={down}>
            <circle cx="24" cy="30.26" r="3.5" />
          </clipPath>
          <clipPath id={over}>
            <circle cx="24" cy="30.26" r="4.4" />
          </clipPath>
        </defs>
        <rect width="48" height="48" rx="11" fill={NAVY} />
        <rect
          x="0.5"
          y="0.5"
          width="47"
          height="47"
          rx="10.5"
          fill="none"
          stroke={GOLD}
          strokeOpacity="0.3"
        />
        <g fill="none" strokeWidth="3">
          <circle cx="18.25" cy="24" r="8.5" stroke={GOLD} />
          <circle
            cx="29.75"
            cy="24"
            r="8.5"
            stroke={NAVY}
            strokeWidth="5.8"
            clipPath={`url(#${up})`}
          />
          <circle cx="29.75" cy="24" r="8.5" stroke={GOLD_LIGHT} />
          <circle
            cx="18.25"
            cy="24"
            r="8.5"
            stroke={NAVY}
            strokeWidth="5.8"
            clipPath={`url(#${down})`}
          />
          <circle cx="18.25" cy="24" r="8.5" stroke={GOLD} clipPath={`url(#${over})`} />
        </g>
      </svg>
    </span>
  );
}

// Assinatura do produto: símbolo + nome, com a frase da marca. `onDark` é para fundo navy fixo.
export function Wordmark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Logo className="w-10" title="" />
      <span className="leading-none">
        <span
          className={cn(
            "block text-[19px] font-extrabold tracking-[-0.03em]",
            onDark ? "text-white" : "text-foreground",
          )}
        >
          {BRAND.name}
        </span>
        <span
          className={cn(
            "mt-1.5 block text-[10px] font-semibold tracking-[0.16em] uppercase",
            onDark ? "text-[var(--gold)]" : "text-[var(--gold-text)]",
          )}
        >
          {BRAND.tagline}
        </span>
      </span>
    </span>
  );
}
