import { useState, type FormEvent } from "react";
import { addDays, format } from "date-fns";
import { Loader2 } from "lucide-react";

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
import { useCreateEvent } from "../api";

const DURATIONS = [15, 30, 45, 60, 90];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  contactId: string;
  contactName: string;
}

export function ScheduleDialog({ open, onOpenChange, accountId, contactId, contactName }: Props) {
  const create = useCreateEvent(accountId, contactId);
  const [title, setTitle] = useState(`Reunião com ${contactName}`);
  const [date, setDate] = useState(() => format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");

  const startsAt = new Date(`${date}T${time}`);
  const valid = title.trim().length > 0 && !Number.isNaN(startsAt.getTime());

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      { title: title.trim(), startsAt, durationMinutes: Number(duration) },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Agendar com {contactName}</DialogTitle>
            <DialogDescription>O evento entra na agenda ligado a este contato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-title">Título</Label>
            <Input
              id="schedule-title"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-date">Data</Label>
              <Input
                id="schedule-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-time">Início</Label>
              <Input
                id="schedule-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule-duration">Duração</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger id="schedule-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d < 60 ? `${d} min` : d === 60 ? "1 hora" : `${d / 60} h`.replace(".", ",")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Agendar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
