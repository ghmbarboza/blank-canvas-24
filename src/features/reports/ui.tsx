import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { BrandTile } from "@/components/brand/BrandIcon";
import type { Headline, Segment } from "./headlines";

// Peças visuais comuns dos relatórios: painel, número-chave e barras horizontais.
export function Panel({
  title,
  brand,
  hint,
  aside,
  className,
  children,
}: {
  title: string;
  /** Marca da ferramenta: logo oficial ao lado do título. */
  brand?: string;
  hint?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-xl border border-border bg-surface p-5 sm:p-6", className)}
      aria-label={title}
    >
      <header className="mb-4 flex items-start gap-3">
        {brand ? <BrandTile id={brand} size={32} /> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-medium">{title}</h3>
          {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** "0", "R$ 0", "R$ 0,00", "0%", "0s", "0 min": valor zerado. */
const isZero = (v: string) =>
  /^(R\$\s*)?0([.,]0+)?\s*(%|s|min|h)?$/.test(v.replace(/\u00a0/g, " ").trim());

export function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  dark = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  dark?: boolean;
}) {
  // O destaque navy é para o número que importa; zero não ganha destaque (Von Restorff).
  const highlight = dark && !isZero(value);
  return (
    <div
      className={cn(
        "rounded-xl border px-5 py-4",
        highlight
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-surface",
      )}
    >
      {Icon && (
        <Icon className={cn("mb-2 size-4", highlight ? "opacity-60" : "text-subtle")} aria-hidden />
      )}
      {/* Revenue-Centric: número zerado não vira destaque; fica discreto e o rótulo explica */}
      <p
        className={cn(
          "font-display leading-none font-semibold tabular-nums",
          isZero(value) ? "text-[18px] opacity-60" : "text-[24px]",
        )}
      >
        {value}
      </p>
      <p className={cn("mt-1.5 text-[12px]", highlight ? "opacity-70" : "text-subtle")}>{label}</p>
      {sub && (
        <p className={cn("mt-0.5 text-[11px]", highlight ? "opacity-60" : "text-subtle")}>{sub}</p>
      )}
    </div>
  );
}

export function BarList({
  rows,
  format,
  empty = "Nada neste período. Aumente o período no topo da página.",
}: {
  rows: { label: string; value: number; sub?: string }[];
  format: (v: number) => string;
  empty?: string;
}) {
  if (rows.length === 0)
    return <p className="py-6 text-center text-[12px] text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="text-[13px]">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {format(r.value)}
              {r.sub && <span className="ml-1.5 text-[11px] font-normal text-subtle">{r.sub}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LoadingGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
      <Skeleton className="h-72 rounded-xl sm:col-span-2 xl:col-span-4" />
    </div>
  );
}

function Segments({ parts }: { parts: Segment[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <strong key={i} className="font-semibold text-foreground tabular-nums">
            {p.n}
          </strong>
        ),
      )}
    </>
  );
}

// Manchete editorial do relatório: a frase com número que resume o período.
export function Lede({ headline, eyebrow }: { headline: Headline; eyebrow: string }) {
  return (
    <section
      aria-label="Resumo do período"
      className="grid gap-4 pb-2 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:items-end lg:gap-10"
    >
      <div className="min-w-0">
        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {eyebrow}
        </span>
        <p className="mt-3 font-display text-[22px] leading-[1.25] text-muted-foreground sm:text-[30px]">
          <Segments parts={headline.lead} />
        </p>
      </div>
      {headline.aside && (
        <p className="text-[14px] leading-relaxed text-muted-foreground lg:pb-1.5 lg:text-[15px]">
          <Segments parts={headline.aside} />
        </p>
      )}
    </section>
  );
}

// Tabela de desempenho: cabeçalho discreto, linhas com row-wash e números alinhados à direita.
export interface PerfColumn<T> {
  label: string;
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

export function PerfTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  empty,
}: {
  rows: T[];
  columns: PerfColumn<T>[];
  rowKey: (row: T) => string;
  caption: string;
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="py-6 text-center text-[12px] text-muted-foreground">{empty}</p>;
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[520px] text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-subtle">
            {columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                className={cn(
                  "px-2 pb-2 font-medium first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
                  c.numeric && "text-right",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="row-wash">
              {columns.map((c) => (
                <td
                  key={c.label}
                  className={cn(
                    "px-2 py-2.5 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
                    c.numeric && "text-right tabular-nums",
                  )}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
