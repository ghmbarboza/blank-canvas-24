import { ChevronDown, KanbanSquare, Plus, Search, Settings2, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { DealFilters, Pipeline } from "../types";

type Props = {
  pipelines: Pipeline[];
  pipelineId: string | null;
  onPipelineChange: (id: string) => void;
  filters: DealFilters;
  onFiltersChange: (f: DealFilters) => void;
  isManager: boolean;
  onConfigure: () => void;
  onNewPipeline: () => void;
  onNewDeal: () => void;
  canCreateDeal: boolean;
};

export function CrmToolbar(props: Props) {
  const { pipelines, pipelineId, filters, onFiltersChange } = props;
  const current = pipelines.find((p) => p.id === pipelineId);

  return (
    <div className="ds-page-header flex shrink-0 flex-wrap items-end gap-x-3 gap-y-3 px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
      <div className="min-w-0">
        <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
          Clientes
        </p>
        <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[30px]">
          Carteira
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="-ml-1 mt-1 flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-left text-[14px] text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Jornada atual: ${current?.name ?? "nenhuma"}. Trocar de jornada`}
            >
              <KanbanSquare className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{current?.name ?? "Jornada"}</span>
              <ChevronDown className="size-4 shrink-0 text-subtle" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Jornadas</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={pipelineId ?? ""} onValueChange={props.onPipelineChange}>
              {pipelines.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id}>
                  {p.name}
                  {p.is_default && <span className="ml-auto text-[11px] text-subtle">padrão</span>}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {props.isManager && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={props.onConfigure} disabled={!pipelineId}>
                  <Settings2 aria-hidden /> Configurar jornada
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={props.onNewPipeline}>
                  <SquarePlus aria-hidden /> Nova jornada
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-3 md:order-last">
        <Button onClick={props.onNewDeal} disabled={!props.canCreateDeal}>
          <Plus aria-hidden /> Novo cliente
        </Button>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 md:flex-none">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Buscar cliente…"
            aria-label="Buscar cliente na carteira"
            className="h-9 w-full border-transparent bg-surface-2 pl-9 md:w-56 lg:w-64"
          />
        </div>
        <div
          className="flex rounded-full border border-border bg-surface-2 p-0.5"
          role="group"
          aria-label="Responsável"
        >
          {(["all", "mine"] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={filters.owner === o}
              onClick={() => onFiltersChange({ ...filters, owner: o })}
              className={cn(
                "h-8 rounded-full px-3 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                filters.owner === o
                  ? "bg-surface text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o === "all" ? "Todos" : "Meus"}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-8 w-px bg-border md:block" aria-hidden />
      </div>
    </div>
  );
}
