import { useState, type FormEvent } from "react";
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
import { useCreateDeal } from "../api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  contactId: string;
  contactName: string;
}

// Aceita "1.500,50" ou "1500.5"; devolve null quando não é um valor válido.
function parseMoney(raw: string): number | null {
  const clean = raw.replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function CreateDealDialog({ open, onOpenChange, accountId, contactId, contactName }: Props) {
  const create = useCreateDeal(accountId, contactId);
  const [title, setTitle] = useState(contactName);
  const [value, setValue] = useState("");
  const amount = parseMoney(value);
  const valid = title.trim().length > 0 && amount !== null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || amount === null) return;
    create.mutate({ title: title.trim(), value: amount }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Criar negócio</DialogTitle>
            <DialogDescription>Entra no funil padrão, na primeira etapa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="deal-title">Título</Label>
            <Input
              id="deal-title"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal-value">Valor (R$)</Label>
            <Input
              id="deal-value"
              inputMode="decimal"
              placeholder="0,00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={amount === null}
            />
            {amount === null && (
              <p className="text-[12px] text-danger">Digite um valor válido, ex.: 1.500,00</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              Criar negócio
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
