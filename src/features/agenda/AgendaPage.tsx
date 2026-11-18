import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";

import { useAccountTimezone, useEvents, useMoveEvent } from "./api";
import { AgendaSidePanel } from "./AgendaSidePanel";
import { AgendaToolbar } from "./AgendaToolbar";
import { daysIn, rangeFor, shiftAnchor, titleFor } from "./calendar";
import { DayList } from "./DayList";
import { EventDialog } from "./EventDialog";
import { MonthGrid } from "./MonthGrid";
import { TimeGrid } from "./TimeGrid";
import { nowWall } from "./tz";
import type { AgendaEvent, AgendaView, EventDraft } from "./types";

const TICK_MS = 60_000;

// Hora de parede da conta, atualizada a cada minuto (linha do "agora").
function useNow(timeZone: string): Date {
  const [now, setNow] = useState(() => nowWall(timeZone));
  useEffect(() => {
    setNow(nowWall(timeZone));
    const id = window.setInterval(() => setNow(nowWall(timeZone)), TICK_MS);
    return () => window.clearInterval(id);
  }, [timeZone]);
  return now;
}

interface DialogState {
  key: number;
  open: boolean;
  event: AgendaEvent | null;
  draft: EventDraft | null;
}

export function AgendaPage() {
  const timeZone = useAccountTimezone();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const now = useNow(timeZone);
  const [view, setView] = useState<AgendaView>("week");
  const [anchor, setAnchor] = useState<Date>(() => nowWall(timeZone));
  const [onlyMine, setOnlyMine] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({
    key: 0,
    open: false,
    event: null,
    draft: null,
  });
  const { mutate: moveEvent } = useMoveEvent();

  // Abaixo de md a semana vira a lista do dia.
  const effectiveView: AgendaView = isMobile && view === "week" ? "day" : view;
  const range = useMemo(() => rangeFor(effectiveView, anchor), [effectiveView, anchor]);
  const days = useMemo(() => daysIn(range), [range]);
  const { data, isLoading, isError, error, isFetching, refetch } = useEvents(range);

  const userId = user?.id ?? null;
  const events = useMemo(
    () => (data ?? []).filter((e) => !onlyMine || e.row.owner_user_id === userId),
    [data, onlyMine, userId],
  );

  const openDialog = useCallback((event: AgendaEvent | null, draft: EventDraft | null) => {
    setDialog((d) => ({ key: d.key + 1, open: true, event, draft }));
  }, []);
  const handleEdit = useCallback((ev: AgendaEvent) => openDialog(ev, null), [openDialog]);
  const handleCreate = useCallback((draft: EventDraft) => openDialog(null, draft), [openDialog]);
  const handleMove = useCallback(
    (ev: AgendaEvent, start: Date, end: Date) => moveEvent({ id: ev.row.id, start, end }),
    [moveEvent],
  );

  const firstDay = days[0] ?? anchor;
  let body;
  if (isError) {
    body = (
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar a agenda"
        description={errorMessage(error)}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (effectiveView === "month") {
    body = (
      <MonthGrid
        days={days}
        anchor={anchor}
        events={events}
        now={now}
        onEdit={handleEdit}
        onOpenDay={(d) => {
          setAnchor(d);
          setView("day");
        }}
      />
    );
  } else if (isMobile) {
    body = (
      <div className="min-h-0 flex-1 overflow-auto">
        <DayList
          day={firstDay}
          events={events}
          onEdit={handleEdit}
          onNew={() => openDialog(null, null)}
        />
      </div>
    );
  } else {
    body = (
      <TimeGrid
        days={days}
        events={events}
        now={now}
        onCreate={handleCreate}
        onEdit={handleEdit}
        onMove={handleMove}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgendaToolbar
        title={titleFor(effectiveView, anchor)}
        view={effectiveView}
        onlyMine={onlyMine}
        isFetching={isFetching}
        onViewChange={setView}
        onPrev={() => setAnchor((a) => shiftAnchor(effectiveView, a, -1))}
        onNext={() => setAnchor((a) => shiftAnchor(effectiveView, a, 1))}
        onToday={() => setAnchor(nowWall(timeZone))}
        onOnlyMine={setOnlyMine}
        onNew={() => openDialog(null, null)}
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col" aria-busy={isLoading}>
          {isLoading && (
            <div
              className="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-primary"
              aria-hidden
            />
          )}
          {body}
        </div>
        <AgendaSidePanel now={now} onlyMine={onlyMine} userId={userId} onEdit={handleEdit} />
      </div>
      <EventDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        event={dialog.event}
        draft={dialog.draft}
      />
    </div>
  );
}
