import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import { BrandTile } from "@/components/brand/BrandIcon";

interface Props {
  title: string;
  description?: string;
  readOnlyNote?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  /** Ferramenta de que o cartão trata: aparece com o logo oficial (DS). */
  brand?: string;
}

export function SettingsCard({
  title,
  description,
  readOnlyNote,
  actions,
  children,
  brand,
}: Props) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {brand && <BrandTile id={brand} size={36} />}
          <div>
            <h2 className="text-[15px] font-medium">{title}</h2>
            {description && (
              <p className="mt-0.5 max-w-xl text-[13px] text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions}
      </header>
      {readOnlyNote && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          {readOnlyNote}
        </p>
      )}
      {children}
    </section>
  );
}
