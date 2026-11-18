import type { ReactNode } from "react";

/** Divide o texto nos trechos entre **asteriscos** (ímpares = destaque). */
export function splitEmphasis(text: string): string[] {
  return text.split("**");
}

/** Texto com nomes de botão e de tela em negrito. */
export function rich(text: string): ReactNode {
  return splitEmphasis(text).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-bold text-[var(--aula-ink)]">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}
