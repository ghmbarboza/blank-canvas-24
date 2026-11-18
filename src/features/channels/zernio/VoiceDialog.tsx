import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/functions";
import { formatPhone } from "@/lib/format";

import { useSaveVoice, type ZernioNumber } from "../zernio-api";
import {
  buildForwardTo,
  parseForwardTo,
  type ForwardChoice,
  type HoursChoice,
} from "../zernio-rules";
import { ForwardPicker } from "./ForwardPicker";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Saved {
  forward?: ForwardChoice;
  hours?: HoursChoice;
  voicemail?: boolean;
  greeting?: string;
  recording?: boolean;
  transcription?: boolean;
  forwardTo?: string;
}

function initial(n: ZernioNumber) {
  const v = (n.voice ?? {}) as Saved;
  return {
    forward: v.forward ?? parseForwardTo(v.forwardTo),
    hours: v.hours ?? {
      enabled: false,
      days: [1, 2, 3, 4, 5],
      open: "08:00",
      close: "18:00",
      timezone: "America/Sao_Paulo",
    },
    voicemail: v.voicemail ?? true,
    greeting: v.greeting ?? "",
    recording: v.recording ?? false,
    transcription: v.transcription ?? false,
  };
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Label htmlFor={id} className="cursor-pointer">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[12px] font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Para onde vão as ligações do número real, em que horário, e o que acontece quando ninguém atende. */
export function VoiceDialog({
  accountId,
  number,
  onClose,
}: {
  accountId: string;
  number: ZernioNumber | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(number)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {number && (
          <VoiceForm key={number.id} accountId={accountId} number={number} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VoiceForm({
  accountId,
  number,
  onClose,
}: {
  accountId: string;
  number: ZernioNumber;
  onClose: () => void;
}) {
  const [s, setS] = useState(() => initial(number));
  const save = useSaveVoice(accountId);
  const fwd = buildForwardTo(s.forward);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) =>
    setS((cur) => ({ ...cur, [k]: v }));

  function submit() {
    save.mutate(
      { numberId: number.id, ...s },
      {
        onSuccess: () => {
          toast.success("Ligações configuradas");
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ligações para {formatPhone(number.phone_number) || "o número"}</DialogTitle>
        <DialogDescription>
          Quem atende, em que horário e o que acontece quando ninguém atende.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <section className="space-y-2">
          <p className="eyebrow">Quem atende</p>
          <ForwardPicker
            id={`voice-${number.id}`}
            value={s.forward}
            onChange={(v) => set("forward", v)}
            ownNumber={number.phone_number}
          />
        </section>

        <section className="space-y-3">
          <Toggle
            id="hours-on"
            label="Horário de atendimento"
            hint="Fora do horário a ligação vai para a caixa postal."
            checked={s.hours.enabled}
            onChange={(v) => set("hours", { ...s.hours, enabled: v })}
          />
          {s.hours.enabled && (
            <div className="space-y-3 rounded-lg bg-surface-2 p-3">
              <ToggleGroup
                type="multiple"
                value={s.hours.days.map(String)}
                onValueChange={(v) => set("hours", { ...s.hours, days: v.map(Number) })}
                className="flex flex-wrap justify-start"
                aria-label="Dias de atendimento"
              >
                {DAYS.map((d, i) => (
                  <ToggleGroupItem
                    key={d}
                    value={String(i)}
                    className="h-8 rounded-full px-3 text-[12px]"
                  >
                    {d}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-2 text-[13px]">
                <Label htmlFor="h-open" className="sr-only">
                  Abre
                </Label>
                <Input
                  id="h-open"
                  type="time"
                  className="w-28"
                  value={s.hours.open}
                  onChange={(e) => set("hours", { ...s.hours, open: e.target.value })}
                />
                <span className="text-muted-foreground">às</span>
                <Label htmlFor="h-close" className="sr-only">
                  Fecha
                </Label>
                <Input
                  id="h-close"
                  type="time"
                  className="w-28"
                  value={s.hours.close}
                  onChange={(e) => set("hours", { ...s.hours, close: e.target.value })}
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <Toggle
            id="vm"
            label="Caixa postal"
            hint="Quando ninguém atende, o cliente deixa recado de até 2 minutos."
            checked={s.voicemail}
            onChange={(v) => set("voicemail", v)}
          />
          {s.voicemail && (
            <div className="space-y-1.5">
              <Label htmlFor="vm-greeting">Saudação (opcional)</Label>
              <Textarea
                id="vm-greeting"
                maxLength={400}
                rows={2}
                placeholder="Oi, você ligou para a Empresa. Deixe seu recado que retornamos ainda hoje."
                value={s.greeting}
                onChange={(e) => set("greeting", e.target.value)}
              />
            </div>
          )}
          <Toggle
            id="rec"
            label="Gravar as ligações"
            hint="Toca um aviso de gravação antes de começar. Custa US$ 0,004 por minuto."
            checked={s.recording}
            onChange={(v) => set("recording", v)}
          />
          <Toggle
            id="tr"
            label="Transcrever"
            hint="O texto da ligação entra na ficha do cliente. Custa US$ 0,03 por minuto."
            checked={s.transcription}
            onChange={(v) => set("transcription", v)}
          />
        </section>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={save.isPending || !fwd.ok}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Salvar
        </Button>
      </DialogFooter>
    </>
  );
}
