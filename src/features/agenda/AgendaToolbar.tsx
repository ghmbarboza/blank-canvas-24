import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { AgendaView } from "./types";

interface Props {
  title: string;
  view: AgendaView;
  onlyMine: boolean;
  isFetching: boolean;
  onViewChange: (view: AgendaView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOnlyMine: (value: boolean) => void;
  onNew: () => void;
}

function isView(v: string): v is AgendaView {
  return v === "day" || v === "week" || v === "month";
}

export function AgendaToolbar({
  title,
  view,
  onlyMine,
  isFetching,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onOnlyMine,
  onNew,
}: Props) {
  return (
    <div className="ds-page-header flex shrink-0 flex-wrap items-end gap-x-4 gap-y-3 px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
      <div className="flex min-w-0 basis-full flex-wrap items-end gap-3 sm:flex-1 sm:basis-auto">
        <div>
          <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
            Vender
          </p>
          <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[30px]">
            Agenda
          </h1>
        </div>
        <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
        <div className="flex min-w-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onPrev}
            aria-label="Período anterior"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <p
            className="min-w-0 truncate text-[14px] font-medium text-muted-foreground first-letter:uppercase"
            aria-live="polite"
            aria-busy={isFetching}
          >
            {title}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onNext}
            aria-label="Próximo período"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button variant="outline" size="sm" onClick={onToday}>
          Hoje
        </Button>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Switch
            checked={onlyMine}
            onCheckedChange={onOnlyMine}
            aria-label="Mostrar só meus eventos"
          />
          Só meus
        </label>
        <Tabs value={view} onValueChange={(v) => isView(v) && onViewChange(v)}>
          <TabsList>
            <TabsTrigger value="day" className="text-[13px]">
              Dia
            </TabsTrigger>
            <TabsTrigger value="week" className="hidden text-[13px] md:inline-flex">
              Semana
            </TabsTrigger>
            <TabsTrigger value="month" className="text-[13px]">
              Mês
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button onClick={onNew} aria-label="Novo evento">
          <Plus aria-hidden />
          <span className="hidden sm:inline">Novo evento</span>
        </Button>
      </div>
    </div>
  );
}
