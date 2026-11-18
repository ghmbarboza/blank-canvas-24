import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const QUICK_REASONS = [
  "Preço",
  "Escolheu concorrente",
  "Sem orçamento",
  "Sem resposta",
  "Não era o momento",
];

type Props = {
  open: boolean;
  dealTitle: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

// Perder sem motivo não ensina nada: o motivo alimenta relatório e a IA.
export function LostReasonDialog({ open, dealTitle, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Por que perdemos?</DialogTitle>
          <DialogDescription className="truncate">{dealTitle}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed) return;
            onConfirm(trimmed.slice(0, 500));
            setReason("");
          }}
          className="space-y-3"
        >
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivos comuns">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                aria-pressed={trimmed === r}
                className={cn(
                  "rounded-md border px-2 py-1 text-[12px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  trimmed === r
                    ? "border-primary-line bg-primary-soft text-primary"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lost-reason">Motivo</Label>
            <Textarea
              id="lost-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Conte em uma frase o que aconteceu"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReason("");
                onCancel();
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!trimmed}>
              Marcar como perdido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
