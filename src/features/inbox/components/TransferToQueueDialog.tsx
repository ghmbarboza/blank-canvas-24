import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useQueues } from "@/features/queue/api";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/functions";

/**
 * Transferir a conversa para uma fila direto da Caixa (#62). A porta é a RPC
 * transfer_conversation_to_queue: tira o responsável, põe na fila com a habilidade dela e deixa
 * a nota interna com o motivo, tudo numa transação.
 */
export function TransferToQueueDialog({
  accountId,
  conversationId,
  open,
  onOpenChange,
}: {
  accountId: string;
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queues = useQueues(accountId);
  const qc = useQueryClient();
  const [queueId, setQueueId] = useState("");
  const [note, setNote] = useState("");
  const active = (queues.data ?? []).filter((q) => q.is_active);
  const transfer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("transfer_conversation_to_queue", {
        _conversation: conversationId,
        _queue: queueId,
        ...(note.trim() ? { _note: note.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      const name = active.find((q) => q.id === queueId)?.name ?? "a fila";
      toast.success(`Conversa transferida para ${name}`);
      await qc.invalidateQueries({ queryKey: ["inbox", accountId] });
      setQueueId("");
      setNote("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir para uma fila</DialogTitle>
          <DialogDescription>
            A conversa sai de você e vai para quem atende a fila escolhida. O motivo fica como nota
            interna, para ninguém perguntar de novo ao cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="transfer-queue">Fila</Label>
            <Select value={queueId} onValueChange={setQueueId}>
              <SelectTrigger id="transfer-queue" aria-label="Fila">
                <SelectValue
                  placeholder={
                    queues.isLoading
                      ? "Carregando filas…"
                      : active.length
                        ? "Escolha a fila"
                        : "Nenhuma fila ativa: crie em Fila e roteamento"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {active.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-note">Motivo (opcional)</Label>
            <Textarea
              id="transfer-note"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="O que o cliente quer e o que já foi feito."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!queueId || transfer.isPending} onClick={() => transfer.mutate()}>
            {transfer.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
