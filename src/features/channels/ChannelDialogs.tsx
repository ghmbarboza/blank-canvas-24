import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { errorMessage } from "@/lib/functions";
import { channelAction, useUpdateChannel, type Channel, type WebhookInfo } from "./api";
import { CopyField } from "./CopyField";
import { OwnerSelect } from "./OwnerSelect";
import type { TeamMember } from "@/features/settings/api";

interface BaseProps {
  accountId: string;
  channel: Channel | null;
  onClose: () => void;
}

export function RenameDialog({ accountId, channel, onClose }: BaseProps) {
  const update = useUpdateChannel(accountId);
  const [name, setName] = useState("");
  useEffect(() => setName(channel?.name ?? ""), [channel]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!channel || !name.trim()) return;
    update.mutate(
      { id: channel.id, name: name.trim() },
      {
        onSuccess: () => {
          toast.success("Canal renomeado");
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <Dialog open={Boolean(channel)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-xl bg-surface">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Renomear canal</DialogTitle>
            <DialogDescription>O nome aparece para a equipe na caixa de entrada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rename-channel">Nome</Label>
            <Input
              id="rename-channel"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={update.isPending || !name.trim()}>
              {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssignDialog({
  accountId,
  channel,
  onClose,
  members,
}: BaseProps & { members: TeamMember[] }) {
  const update = useUpdateChannel(accountId);
  const [owner, setOwner] = useState<string | null>(null);
  const [shared, setShared] = useState(true);
  useEffect(() => {
    setOwner(channel?.owner_user_id ?? null);
    setShared(channel?.is_shared ?? true);
  }, [channel]);

  function save() {
    if (!channel) return;
    update.mutate(
      { id: channel.id, ownerUserId: owner, isShared: owner ? shared : true },
      {
        onSuccess: () => {
          toast.success("Responsável atualizado");
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <Dialog open={Boolean(channel)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-xl bg-surface">
        <DialogHeader>
          <DialogTitle>Responsável pelo canal</DialogTitle>
          <DialogDescription>
            Um vendedor dono vê as conversas deste número mesmo que não seja compartilhado.
          </DialogDescription>
        </DialogHeader>
        <OwnerSelect id="assign-owner" members={members} value={owner} onChange={setOwner} />
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <Label htmlFor="assign-shared">Compartilhar com a equipe</Label>
            <p className="text-[12px] text-muted-foreground">
              {owner
                ? "Desligado, só o dono e os gestores veem."
                : "Sem dono, o canal é sempre da equipe."}
            </p>
          </div>
          <Switch
            id="assign-shared"
            checked={owner ? shared : true}
            disabled={!owner}
            onCheckedChange={setShared}
          />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WebhookDialog({ accountId, channel, onClose }: BaseProps) {
  const info = useQuery({
    queryKey: ["channel-webhook", accountId, channel?.id],
    enabled: Boolean(channel),
    queryFn: () =>
      channelAction<WebhookInfo>(accountId, "channel.webhook_info", { channelId: channel?.id }),
  });

  return (
    <Dialog open={Boolean(channel)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-xl bg-surface">
        <DialogHeader>
          <DialogTitle>Endereço de recebimento (webhook)</DialogTitle>
          <DialogDescription>
            Endereço para onde o provedor envia as mensagens deste canal.
          </DialogDescription>
        </DialogHeader>
        {info.isLoading && (
          <Loader2
            className="mx-auto size-5 animate-spin text-muted-foreground"
            aria-label="Carregando"
          />
        )}
        {info.isError && <p className="text-[13px] text-danger">{errorMessage(info.error)}</p>}
        {info.data && (
          <div className="space-y-3">
            <CopyField label="URL do webhook" value={info.data.webhookUrl} />
            {info.data.verifyToken && (
              <CopyField label="Token de verificação" value={info.data.verifyToken} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
