import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MOMENT_FILTERS,
  MOMENT_LABEL,
  isMomentKey,
  type MomentCounts,
} from "@/features/posvenda/moment";
import { cn } from "@/lib/utils";

import {
  LIFECYCLES,
  LIFECYCLE_LABEL,
  isLifecycle,
  sourceLabel,
  type ContactFilters,
} from "../types";

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors duration-150 active:scale-[0.98]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary-line bg-primary-soft text-foreground"
          : "border-transparent bg-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type Props = {
  filters: ContactFilters;
  onChange: (next: ContactFilters) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sources: string[];
  // Pílulas de segmento, à esquerda da busca.
  segments?: ReactNode;
  /** Quantos clientes em cada momento do pós-venda (aparece ao lado de cada opção). */
  momentCounts?: MomentCounts | undefined;
};

export function ContactsFilters({
  filters,
  onChange,
  search,
  onSearchChange,
  sources,
  segments,
  momentCounts,
}: Props) {
  const set = <K extends keyof ContactFilters>(key: K, value: ContactFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-background px-4 pt-1 pb-3 md:px-6">
      <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">{segments}</div>
        <div className="relative w-full lg:w-72">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar nome, empresa, telefone…"
            aria-label="Buscar clientes"
            className="h-9 pr-8 pl-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <FilterChip active={filters.onlyMine} onClick={() => set("onlyMine", !filters.onlyMine)}>
          Só meus
        </FilterChip>
        <Select
          value={filters.lifecycle}
          onValueChange={(v) => set("lifecycle", isLifecycle(v) ? v : "all")}
        >
          <SelectTrigger
            className="h-7 w-auto gap-1.5 rounded-full border-transparent bg-transparent px-3 text-[12px] shadow-none hover:bg-surface-2"
            aria-label="Fase"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda fase</SelectItem>
            {LIFECYCLES.map((l) => (
              <SelectItem key={l} value={l}>
                {LIFECYCLE_LABEL[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.moment}
          onValueChange={(v) => set("moment", isMomentKey(v) ? v : "all")}
        >
          <SelectTrigger
            className={cn(
              "h-7 w-auto gap-1.5 rounded-full border-transparent bg-transparent px-3 text-[12px] shadow-none hover:bg-surface-2",
              filters.moment !== "all" && "border-primary-line bg-primary-soft",
            )}
            aria-label="Momento no pós-venda"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo momento</SelectItem>
            {MOMENT_FILTERS.map((k) => (
              <SelectItem key={k} value={k}>
                {MOMENT_LABEL[k]}
                {momentCounts ? ` (${momentCounts[k]})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.source} onValueChange={(v) => set("source", v)}>
          <SelectTrigger
            className="h-7 w-auto gap-1.5 rounded-full border-transparent bg-transparent px-3 text-[12px] shadow-none hover:bg-surface-2"
            aria-label="Origem"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda origem</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {PLATFORM_LABEL[s] && s !== "csv" && s !== "manual"
                  ? PLATFORM_LABEL[s]
                  : sourceLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
