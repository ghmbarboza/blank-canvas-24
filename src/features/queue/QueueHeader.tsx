import type { ReactNode } from "react";

// Cabeçalho editorial das telas de gestão da fila (roteamento e painel ao vivo): título grande,
// frase curta do que se faz ali e as ações à direita.
export function QueueHeader({
  title,
  description,
  meta,
  actions,
  eyebrow = "Atender",
}: {
  eyebrow?: string;
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
      <div className="min-w-[240px] flex-1">
        {meta && <div className="mb-3 flex flex-wrap items-center gap-2">{meta}</div>}
        <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[30px]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
