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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { ContactPicker, type PickedContact } from "@/features/contacts/components/ContactPicker";

import { useCreateDeal } from "../api";
import { parseMoneyInput } from "../money";
import { stageKind, type Stage } from "../types";

type Props = {
  accountId: string;
  pipelineId: string;
  stages: Stage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topPosition: (stageId: string) => number;
  onCreated?: ((id: string) => void) | undefined;
};

export function NewDealDialog({
  accountId,
  pipelineId,
  stages,
  open,
  onOpenChange,
  topPosition,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const create = useCreateDeal(accountId);
  const openStages = stages.filter((s) => stageKind(s) === "open");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [stageId, setStageId] = useState<string>("");
  const [touched, setTouched] = useState(false);

  const effectiveStage = stageId || openStages[0]?.id || "";
  const parsedValue = parseMoneyInput(value);
  const titleError = touched && !title.trim() ? "Dê um nome ao cartão" : null;

  function reset() {
    setTitle("");
    setValue("");
    setContact(null);
    setStageId("");
    setTouched(false);
  }

  async function submit() {
    setTouched(true);
    if (!title.trim() || parsedValue === null || !effectiveStage) return;
    try {
      const id = await create.mutateAsync({
        pipeline_id: pipelineId,
        stage_id: effectiveStage,
        title: title.trim().slice(0, 160),
        value: parsedValue,
        contact_id: contact?.id ?? null,
        owner_user_id: user?.id ?? null,
        source: contact?.source ?? "manual",
        position: topPosition(effectiveStage),
      });
      toast.success("Cliente colocado na carteira");
      reset();
      onOpenChange(false);
      onCreated?.(id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo cliente na carteira</DialogTitle>
          <DialogDescription>
            Entra no topo da etapa escolhida, com você como responsável.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="new-deal-title">Título</Label>
            <Input
              id="new-deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Clínica Bem Estar · Plano anual"
              aria-invalid={Boolean(titleError)}
              autoFocus
            />
            {titleError && <p className="text-[12px] text-danger">{titleError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-deal-value">Valor do contrato (R$)</Label>
              <Input
                id="new-deal-value"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                aria-invalid={parsedValue === null}
              />
              {parsedValue === null && <p className="text-[12px] text-danger">Valor inválido</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-deal-stage">Etapa</Label>
              <Select value={effectiveStage} onValueChange={setStageId}>
                <SelectTrigger id="new-deal-stage" className="h-9">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {openStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-deal-contact">Cliente (opcional)</Label>
            <ContactPicker
              id="new-deal-contact"
              accountId={accountId}
              value={contact}
              onChange={setContact}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !effectiveStage}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Colocar na carteira
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
