import { useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useAccountTimezone, useContactDeals, useMembers, useSaveEvent } from "./api";
import { durationLabel } from "./calendar";
import { ContactPicker } from "./ContactPicker";
import {
  DURATIONS,
  NONE,
  addToTime,
  defaultsFor,
  eventFormSchema,
  minutesBetween,
  toEventInput,
  type EventFormValues,
} from "./eventForm";
import { nowWall } from "./tz";
import type { AgendaEvent, EventContact, EventDraft } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AgendaEvent | null;
  draft: EventDraft | null;
}

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      {children}
      {error && (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function EventDialog({ open, onOpenChange, event, draft }: Props) {
  const { user } = useAuth();
  const timeZone = useAccountTimezone();
  const save = useSaveEvent();
  const members = useMembers();
  const [contact, setContact] = useState<EventContact | null>(event?.contact ?? null);
  const deals = useContactDeals(contact?.id ?? null);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: defaultsFor(event, draft, user?.id ?? null, nowWall(timeZone)),
  });
  const { register, control, handleSubmit, watch, setValue, formState } = form;
  const errors = formState.errors;
  const allDay = watch("allDay");
  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const minutes = minutesBetween(startTime, endTime);

  const submit = handleSubmit((values) => {
    save.mutate(
      { id: event?.row.id ?? null, input: toEventInput(values, timeZone) },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-medium">
            {event ? "Editar evento" : "Novo evento"}
          </DialogTitle>
          <DialogDescription>Reunião, visita ou demonstração com um contato.</DialogDescription>
        </DialogHeader>

        <form id="event-form" onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          <Field id="ev-title" label="Título" error={errors.title?.message}>
            <Input
              id="ev-title"
              autoFocus
              placeholder="Ex.: Demonstração do produto"
              {...register("title")}
            />
          </Field>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field id="ev-date" label="Data" error={errors.date?.message}>
              <Input id="ev-date" type="date" {...register("date")} />
            </Field>
            <label className="flex h-9 items-center gap-2 text-[13px]">
              <Controller
                control={control}
                name="allDay"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Dia inteiro"
                  />
                )}
              />
              Dia inteiro
            </label>
          </div>

          {!allDay && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <Field id="ev-start" label="Início" error={errors.startTime?.message}>
                  <Input
                    id="ev-start"
                    type="time"
                    step={900}
                    className="tabular-nums"
                    {...register("startTime")}
                  />
                </Field>
                <Field id="ev-end" label="Fim" error={errors.endTime?.message}>
                  <Input
                    id="ev-end"
                    type="time"
                    step={900}
                    className="tabular-nums"
                    {...register("endTime")}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duração">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setValue("endTime", addToTime(startTime, d), { shouldValidate: true })
                    }
                    aria-pressed={minutes === d}
                    className={cn(
                      "cursor-pointer rounded-md border px-2 py-1 text-[12px] tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      minutes === d
                        ? "border-primary-line bg-primary-soft text-primary"
                        : "border-border text-muted-foreground hover:bg-surface-2",
                    )}
                  >
                    {durationLabel(d)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field id="ev-contact" label="Contato">
            <ContactPicker
              id="ev-contact"
              value={contact}
              onChange={(c) => {
                setContact(c);
                setValue("contactId", c?.id ?? "");
                setValue("dealId", NONE);
              }}
            />
          </Field>

          {contact && (
            <Field id="ev-deal" label="Negócio do contato (opcional)">
              <Controller
                control={control}
                name="dealId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ev-deal">
                      <SelectValue placeholder="Sem negócio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem negócio</SelectItem>
                      {(deals.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.title} · {formatMoney(d.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ev-location" label="Local" error={errors.location?.message}>
              <Input id="ev-location" placeholder="Endereço ou sala" {...register("location")} />
            </Field>
            <Field id="ev-link" label="Link da reunião" error={errors.meetingUrl?.message}>
              <Input id="ev-link" type="url" placeholder="https://" {...register("meetingUrl")} />
            </Field>
          </div>

          <Field id="ev-owner" label="Responsável">
            <Controller
              control={control}
              name="ownerUserId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="ev-owner">
                    <SelectValue placeholder="Sem responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem responsável</SelectItem>
                    {(members.data ?? []).map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.name}
                        {m.userId === user?.id ? " (você)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field id="ev-desc" label="Descrição" error={errors.description?.message}>
            <Textarea
              id="ev-desc"
              rows={3}
              placeholder="Pauta, contexto, o que levar"
              {...register("description")}
            />
          </Field>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="event-form" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : event ? "Salvar" : "Criar evento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
