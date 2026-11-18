import { Link } from "@tanstack/react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { DealFilters, Pipeline, TemperatureFilter } from "../types";

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
  forecast: ForecastState;
};

export type ForecastState =
  { status: "loading" } | { status: "error" } | { status: "ready"; won: number; commit: number };

const TEMPS: Array<{ value: TemperatureFilter; label: string }> = [
  { value: "all", label: "Toda temperatura" },
  { value: "hot", label: "Quentes" },
  { value: "warm", label: "Mornos" },
  { value: "cold", label: "Frios" },
];

export function CrmToolbar(props: Props) {
  const { pipelines, pipelineId, filters, onFiltersChange, forecast } = props;
  const current = pipelines.find((p) => p.id === pipelineId);

  return (
    <div className="ds-page-header flex shrink-0 flex-wrap items-end gap-x-3 gap-y-3 px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
      <div className="min-w-0">
        <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
          Vender
        </p>
        <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[30px]">
          Funil de vendas
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="-ml-1 mt-1 flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 text-left text-[14px] text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Funil atual: ${current?.name ?? "nenhum"}. Trocar de funil`}
            >
              <KanbanSquare className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{current?.name ?? "Funil"}</span>
              <ChevronDown className="size-4 shrink-0 text-subtle" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Funis</DropdownMenuLabel>
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
                  <Settings2 aria-hidden /> Configurar funil
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={props.onNewPipeline}>
                  <SquarePlus aria-hidden /> Novo funil
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-3 md:order-last">
        <ForecastFigure forecast={forecast} />
        <Button onClick={props.onNewDeal} disabled={!props.canCreateDeal}>
          <Plus aria-hidden /> Novo
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
            placeholder="Buscar negócio…"
            aria-label="Buscar negócio ou contato"
            className="h-9 w-full border-transparent bg-surface-2 pl-9 md:w-56 lg:w-64"
          />
        </div>
        <div
          className="flex rounded-full border border-border bg-surface-2 p-0.5"
          role="group"
          aria-label="Dono"
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
        <Select
          value={filters.temperature}
          onValueChange={(v) =>
            onFiltersChange({
              ...filters,
              temperature: TEMPS.find((t) => t.value === v)?.value ?? "all",
            })
          }
        >
          <SelectTrigger className="h-9 w-40 rounded-full" aria-label="Temperatura do contato">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="mx-1 hidden h-8 w-px bg-border md:block" aria-hidden />
      </div>
    </div>
  );
}

// "Previsão do mês" do forecast da conta: já ganho + compromisso (o mesmo número do painel).
function ForecastFigure({ forecast }: { forecast: ForecastState }) {
  const label = <span className="block text-[11px] text-subtle">Previsão do mês</span>;
  if (forecast.status === "loading")
    return (
      <span className="text-right" aria-busy>
        {label}
        <Skeleton className="mt-1 h-5 w-20" />
      </span>
    );
  if (forecast.status === "error")
    return (
      <span className="text-right" title="Não deu para calcular a previsão agora">
        {label}
        <span className="font-display text-[17px] font-semibold text-subtle">—</span>
      </span>
    );
  // Nada ganho nem em compromisso: "R$ 0" ao lado da previsão ponderada confunde; fica só a ponderada.
  if (forecast.won + forecast.commit === 0) return null;
  return (
    <Link
      to="/relatorios"
      search={{ aba: "forecast" }}
      className="rounded-lg px-1.5 py-0.5 text-right hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      title={`${formatMoney(forecast.won)} já ganho + ${formatMoney(forecast.commit)} em compromisso. Abrir previsão completa.`}
    >
      {label}
      <span className="block font-display text-[17px] leading-tight font-semibold tabular-nums">
        {formatMoney(forecast.won + forecast.commit, true)}
      </span>
    </Link>
  );
}
