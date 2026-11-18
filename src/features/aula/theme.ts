import type { CSSProperties } from "react";

// Identidade do G4 Educação, local à página: não depende do tema global nem do modo escuro.
export const AULA_VARS = {
  "--aula-navy": "#001F35",
  "--aula-navy-2": "#0A2E49",
  "--aula-gold": "#B9915B",
  "--aula-gold-dark": "#977342",
  /** Dourado para texto pequeno sobre fundo claro (contraste AA). */
  "--aula-gold-ink": "#7A5C33",
  "--aula-paper": "#FBFAF7",
  "--aula-white": "#FFFFFF",
  "--aula-ink": "#001F35",
  "--aula-muted": "#465866",
  "--aula-line": "rgb(0 31 53 / 0.14)",
  "--aula-line-soft": "rgb(0 31 53 / 0.08)",
  "--aula-gold-wash": "rgb(185 145 91 / 0.12)",
  "--aula-on-navy": "#FFFFFF",
  "--aula-on-navy-muted": "#B8C6D1",
  "--aula-navy-line": "rgb(255 255 255 / 0.14)",
  fontFamily: '"Manrope", "Geist", "Inter", ui-sans-serif, system-ui, sans-serif',
} as CSSProperties;

export const MANROPE_HREF =
  "https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&display=swap";

/** Foco visível sobre fundo claro e sobre o azul-marinho. */
export const FOCUS_LIGHT =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--aula-navy)]";
export const FOCUS_DARK =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--aula-gold)]";

/** Botão principal: fundo dourado, texto azul-marinho. */
export const GOLD_BUTTON =
  "inline-flex items-center justify-center gap-2.5 rounded-md bg-[var(--aula-gold)] font-extrabold text-[var(--aula-navy)] " +
  "shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_10px_24px_-12px_rgb(0_31_53/0.55)] " +
  "transition-[transform,background-color] duration-200 ease-out " +
  "hover:bg-[var(--aula-gold-dark)] hover:text-white hover:-translate-y-0.5 active:translate-y-0 " +
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0";
