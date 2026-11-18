import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { groupLabelFor } from "@/components/layout/nav";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  /** Rótulo acima do título; por padrão, o grupo do menu em que a tela mora. */
  eyebrow?: string;
};

// Cabeçalho de página do DS: sem barra de topo; eyebrow (grupo da sidebar) + título
// 30px/500 + descrição do resultado, e a ação da tela à direita.
export function PageHeader({ title, description, actions, children, eyebrow }: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const label = eyebrow ?? groupLabelFor(path);
  return (
    <div className="ds-page-header flex shrink-0 flex-wrap items-end gap-x-4 gap-y-3 px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
          {label}
        </p>
        <h1 className="font-display text-[26px] leading-tight font-medium text-foreground sm:text-[30px]">
          {title}
        </h1>
        {description && <p className="mt-1 text-[14px] text-muted-foreground">{description}</p>}
      </div>
      {children}
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
