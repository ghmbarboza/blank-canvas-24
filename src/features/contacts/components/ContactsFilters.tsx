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
import { cn } from "@/lib/utils";

import {
  LIFECYCLES,
  LIFECYCLE_LABEL,
  isLifecycle,
  sourceLabel,
  type ContactFilters,
  type TemperatureFilter,
} from "../types";

const TEMP_CHIPS: Array<{ value: TemperatureFilter; label: string }> = [
  { value: "all", label: "Toda temperatura" },
  { value: "hot", label: "Quentes" },
  { value: "warm", label: "Mornos" },
  { value: "cold", label: "Frios" },
  { value: "none", label: "Sem leitura" },
];

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
};

export function ContactsFilters({
  filters,
  onChange,
  search,
  onSearchChange,
  sources,
  segments,
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
            aria-label="Buscar contatos"
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
        <div
          className="-mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto px-1"
          role="group"
          aria-label="Temperatura"
        >
          {TEMP_CHIPS.map((c) => (
            <FilterChip
              key={c.value}
              active={filters.temperature === c.value}
              onClick={() => set("temperature", c.value)}
            >
              {c.label}
            </FilterChip>
          ))}
        </div>
        <span className="mx-1 hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
        <FilterChip active={filters.onlyMine} onClick={() => set("onlyMine", !filters.onlyMine)}>
          Só meus
        </FilterChip>
        <Select
          value={filters.lifecycle}
          onValueChange={(v) => set("lifecycle", isLifecycle(v) ? v : "all")}
        >
          <SelectTrigger
            className="h-7 w-auto gap-1.5 rounded-full border-transparent bg-transparent px-3 text-[12px] shadow-none hover:bg-surface-2"
            aria-label="Ciclo"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo ciclo</SelectItem>
            {LIFECYCLES.map((l) => (
              <SelectItem key={l} value={l}>
                {LIFECYCLE_LABEL[l]}
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
