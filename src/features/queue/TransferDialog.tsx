import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";

import { useLive, useTransferBrief, type MyItem, type TransferResult } from "./api";
import { AGENT_STATE_LABEL } from "./lib";

/**
 * Transferência com apresentação: o colega recebe o resumo antes, e o atendente tecla *ramal#
 * no telefone para falar com ele primeiro (recurso da PABX da Zadarma) e só então passar o cliente.
 */
export function TransferDialog({
  item,
  accountId,
  onClose,
}: {
  item: MyItem;
  accountId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const live = useLive(accountId);
  const send = useTransferBrief(accountId);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState(item.summary ?? "");
  const [done, setDone] = useState<TransferResult | null>(null);
  const colleagues = (live.data?.agents ?? []).filter((a) => a.user_id !== user?.id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir com resumo</DialogTitle>
          <DialogDescription>
            O colega lê o caso antes de falar com o cliente. Ninguém repete nada.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-3 text-[14px]">
            <p>
              Resumo enviado para <strong>{done.target_name}</strong>.
            </p>
            {done.code ? (
              <div className="rounded-xl bg-surface-2 p-4">
                <p className="text-[13px] text-muted-foreground">No teclado do telefone, digite:</p>
                <p className="font-display text-3xl font-semibold tabular-nums">{done.code}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Você fala com {done.target_name} primeiro. Quando um de vocês desligar, o cliente
                  passa para ele. Se ninguém atender em 25 s, o cliente volta para você.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 rounded-full"
                  onClick={() => void navigator.clipboard?.writeText(done.code ?? "")}
                >
                  <Copy className="size-4" /> Copiar
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {done.target_name} ainda não tem ramal na Zadarma. Peça ao gestor para criar em
                Ajustes › Telefonia; até lá, use a transferência do próprio telefone.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Para quem</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label="Colega">
                  <SelectValue
                    placeholder={colleagues.length ? "Escolha um colega" : "Ninguém mais na equipe"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {colleagues.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.name} · {AGENT_STATE_LABEL[c.state]}
                      {c.extension ? ` · ramal ${c.extension}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-note">Resumo para o colega</Label>
              <Textarea
                id="tr-note"
                rows={4}
                maxLength={1500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Quem é, o que quer, o que já foi feito."
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {done ? (
            <Button className="rounded-full" onClick={onClose}>
              Fechar
            </Button>
          ) : (
            <Button
              className="rounded-full"
              disabled={!target || note.trim().length < 5 || send.isPending}
              onClick={() =>
                send.mutate(
                  { workItemId: item.id, targetUserId: target, note },
                  { onSuccess: setDone, onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              {send.isPending && <Loader2 className="size-4 animate-spin" />}
              Enviar resumo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
