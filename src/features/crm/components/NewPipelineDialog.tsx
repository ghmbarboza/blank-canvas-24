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
import { errorMessage } from "@/lib/functions";

import { useCreatePipeline } from "../api";

type Props = {
  accountId: string;
  nextPosition: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
};

export function NewPipelineDialog({
  accountId,
  nextPosition,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const create = useCreatePipeline(accountId);
  const [name, setName] = useState("");

  async function submit() {
    const clean = name.trim();
    if (!clean) return;
    try {
      const id = await create.mutateAsync({ name: clean.slice(0, 80), position: nextPosition });
      toast.success("Jornada criada com as etapas padrão");
      setName("");
      onOpenChange(false);
      onCreated(id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova jornada</DialogTitle>
          <DialogDescription>
            Começa com as etapas padrão. Depois você ajusta em “Configurar jornada”.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="pipeline-name">Nome</Label>
            <Input
              id="pipeline-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Renovações"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Criar jornada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
