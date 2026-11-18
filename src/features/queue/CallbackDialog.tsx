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
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/functions";

import { useRequestCallback } from "./api";

/** Retorno de ligação no lugar de deixar o cliente esperando: entra na fila no horário escolhido. */
export function CallbackDialog({
  accountId,
  onClose,
  phone: initialPhone = "",
  contactId = null,
}: {
  accountId: string;
  onClose: () => void;
  phone?: string;
  contactId?: string | null;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const req = useRequestCallback(accountId);
  const digits = phone.replace(/\D/g, "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agendar retorno de ligação</DialogTitle>
          <DialogDescription>
            O retorno entra na fila e vai para quem estiver livre (ou para quem já cuida do
            cliente).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cb-phone">Telefone com DDD</Label>
            <Input
              id="cb-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 98765-4321"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb-when">Quando (vazio = assim que alguém ficar livre)</Label>
            <Input
              id="cb-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cb-note">Assunto</Label>
            <Textarea
              id="cb-note"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            className="rounded-full"
            disabled={digits.length < 10 || req.isPending}
            onClick={() =>
              req.mutate(
                {
                  phone: digits.length <= 11 ? `55${digits}` : digits,
                  contactId,
                  when: when ? new Date(when).toISOString() : null,
                  note,
                },
                {
                  onSuccess: () => {
                    toast.success("Retorno agendado na fila");
                    onClose();
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {req.isPending && <Loader2 className="size-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
