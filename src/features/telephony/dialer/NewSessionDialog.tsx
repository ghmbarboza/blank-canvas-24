import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSegments } from "@/features/segments/api";
import { errorMessage } from "@/lib/functions";

import { useCreateDialerSession, type DialerMode, type DialerSession } from "./api";

const ALL = "__todos__";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (s: DialerSession) => void;
}

export function NewSessionDialog({ accountId, open, onOpenChange, onCreated }: Props) {
  const segments = useSegments(accountId);
  const create = useCreateDialerSession(accountId);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<DialerMode>("preview");
  const [segmentId, setSegmentId] = useState<string>(ALL);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const seg = (segments.data ?? []).find((s) => s.id === segmentId) ?? null;
    try {
      const s = await create.mutateAsync({
        name: name || seg?.name || "Sessão de ligações",
        mode,
        segmentId: seg?.id ?? null,
        filter: seg?.filter ?? null,
      });
      toast.success(`${s.contact_ids.length} contatos na fila`);
      onCreated(s);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Nova sessão de ligações</DialogTitle>
            <DialogDescription>
              A fila pega os contatos com telefone do segmento, dos mais quentes para os mais frios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dialer-name">Nome</Label>
            <Input
              id="dialer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Retorno dos leads de outubro"
            />
          </div>
          <div className="space-y-2">
            <Label>Quem entra na fila</Label>
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os contatos com telefone</SelectItem>
                {(segments.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Modo</legend>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as DialerMode)}
              className="grid gap-2"
            >
              <ModeOption
                value="preview"
                title="Preview"
                text="Você lê a ficha e decide quando ligar."
              />
              <ModeOption
                value="power"
                title="Power"
                text="Depois de registrar o resultado, liga para o próximo em 5 s (dá para pausar)."
              />
            </RadioGroup>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Montando a fila…" : "Começar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({ value, title, text }: { value: DialerMode; title: string; text: string }) {
  return (
    <Label
      htmlFor={`mode-${value}`}
      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
    >
      <RadioGroupItem id={`mode-${value}`} value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{text}</span>
      </span>
    </Label>
  );
}
