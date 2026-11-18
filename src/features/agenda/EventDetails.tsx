import { useNavigate } from "@tanstack/react-router";
import { differenceInMinutes, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Ban,
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquare,
  Pencil,
  UserX,
  Video,
  AlignLeft,
} from "lucide-react";
import { toast } from "sonner";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { TempChip } from "@/components/common/TempChip";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { StartMeetingButton } from "@/features/meetings/StartMeetingButton";

import { useLatestConversation, useSetEventStatus } from "./api";
import { durationLabel, formatSpan } from "./calendar";
import { safeUrl } from "./eventTone";
import { EVENT_STATUS_LABEL, isEventStatus, type AgendaEvent, type EventStatus } from "./types";

interface Props {
  event: AgendaEvent;
  onEdit: () => void;
  onDone: () => void;
}

export function EventDetails({ event, onEdit, onDone }: Props) {
  const navigate = useNavigate();
  const latest = useLatestConversation();
  const setStatus = useSetEventStatus();
  const { row, contact, deal } = event;
  const link = safeUrl(row.meeting_url);
  const minutes = differenceInMinutes(event.end, event.start);
  const status = isEventStatus(row.status) ? row.status : "scheduled";

  const openConversation = async () => {
    if (!contact) return;
    const id = await latest.mutateAsync(contact.id).catch(() => undefined);
    if (id === undefined) return;
    if (!id) {
      toast.info("Esse contato ainda não tem conversa");
      return;
    }
    onDone();
    void navigate({ to: "/inbox/$conversationId", params: { conversationId: id } });
  };

  const changeStatus = (next: EventStatus) => {
    setStatus.mutate({ id: row.id, status: next }, { onSuccess: onDone });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {contact ? (
          <ContactAvatar
            name={contact.name}
            src={contact.avatar_url}
            platform={contact.source}
            size={40}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[15px] font-semibold leading-snug",
              status === "canceled" && "line-through",
            )}
          >
            {row.title}
          </p>
          {contact && (
            <p className="truncate text-[13px] text-muted-foreground">
              {contact.name ?? "Sem nome"}
              {contact.company ? ` · ${contact.company}` : ""}
            </p>
          )}
          {status !== "scheduled" && (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-subtle">
              {EVENT_STATUS_LABEL[status]}
            </p>
          )}
        </div>
      </div>

      {(deal || contact?.temperature) && (
        <div className="grid grid-cols-2 gap-2">
          {deal && (
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-subtle">
                Negócio
              </p>
              <p className="mt-1 font-display text-[17px] font-semibold tabular-nums">
                {formatMoney(deal.value)}
              </p>
              <p className="truncate text-[11px] text-subtle">{deal.title}</p>
            </div>
          )}
          {contact?.temperature && (
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-subtle">
                Temperatura
              </p>
              <TempChip level={contact.temperature} score={contact.score} className="mt-2" />
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2 text-[13px]">
        <li className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
          <span className="tabular-nums">
            {format(event.start, "EEE, d 'de' MMM", { locale: ptBR })} · {formatSpan(event)}
            {!row.all_day && <span className="text-subtle"> ({durationLabel(minutes)})</span>}
          </span>
        </li>
        {row.location && (
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <span className="break-words">{row.location}</span>
          </li>
        )}
        {link && (
          <li className="flex items-start gap-2">
            <Video className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-primary underline-offset-4 hover:underline"
            >
              {link.replace(/^https?:\/\//, "")}
            </a>
          </li>
        )}
        {row.description && (
          <li className="flex items-start gap-2">
            <AlignLeft className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <p className="whitespace-pre-line text-muted-foreground">{row.description}</p>
          </li>
        )}
      </ul>

      {status !== "canceled" && (
        <StartMeetingButton
          className="w-full"
          eventId={row.id}
          contactId={contact?.id ?? null}
          dealId={deal?.id ?? null}
          title={row.title}
          start={row.starts_at}
          durationMin={Math.max(15, minutes)}
          variant={contact ? "outline" : "default"}
        />
      )}

      {contact && (
        <Button
          className="w-full"
          onClick={() => void openConversation()}
          disabled={latest.isPending}
        >
          <MessageSquare aria-hidden />
          {latest.isPending ? "Abrindo…" : "Abrir conversa"}
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil aria-hidden /> Editar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={setStatus.isPending || status === "done"}
          onClick={() => changeStatus("done")}
        >
          <CheckCircle2 aria-hidden /> Feito
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={setStatus.isPending || status === "no_show"}
          onClick={() => changeStatus("no_show")}
        >
          <UserX aria-hidden /> Não compareceu
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-danger"
          disabled={setStatus.isPending || status === "canceled"}
          onClick={() => changeStatus("canceled")}
        >
          <Ban aria-hidden /> Cancelar
        </Button>
      </div>
    </div>
  );
}
