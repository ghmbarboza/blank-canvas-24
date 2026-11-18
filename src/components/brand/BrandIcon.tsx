import { Package } from "lucide-react";

import { cn } from "@/lib/utils";
import { glyph, OFFICIAL_LOGOS, resolve } from "./brand-meta";

type BrandIconProps = {
  id: string;
  /** Tamanho do glifo em px. */
  size?: number;
  className?: string;
};

// Marcas pretas ou quase pretas usam a cor do texto, para continuar legíveis no tema escuro.
function isNearBlack(hex: string): boolean {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r + g + b < 120;
}

/** Só o glifo, na cor da marca. */
export function BrandIcon({ id, size = 20, className }: BrandIconProps) {
  const key = resolve(id);
  const official = OFFICIAL_LOGOS[key];
  if (official) {
    return (
      <img
        src={official.src}
        alt={official.title}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-[22%] object-contain", className)}
      />
    );
  }
  const g = glyph(key);
  if (!g) return <Package className={className} width={size} height={size} aria-hidden />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={g.label}
      className={cn("shrink-0", className)}
      fill={isNearBlack(g.hex) ? "currentColor" : g.hex}
    >
      <path d={g.path} />
    </svg>
  );
}

/** Tile quadrado do DS (raio sm, hairline navy) com o logo dentro. */
export function BrandTile({ id, size = 40, className }: BrandIconProps) {
  const key = resolve(id);
  const official = Boolean(OFFICIAL_LOGOS[key]);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--via-radius-sm)] border border-[var(--via-border-soft)]",
        official ? "bg-white" : "bg-surface",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BrandIcon id={key} size={Math.round(size * (official ? 0.72 : 0.5))} />
    </span>
  );
}
