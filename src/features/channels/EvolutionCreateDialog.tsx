import { useState, type FormEvent } from "react";
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
import { errorMessage } from "@/lib/functions";
import { useTeamMembers } from "@/features/settings/api";
import { isConnected, useChannelAction, useIntegrations, type CreateEvolutionResult } from "./api";
import { EvolutionServerForm } from "./IntegrationForms";
import { OwnerSelect } from "./OwnerSelect";
import { BrandIcon } from "@/components/brand/BrandIcon";

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateEvolutionResult) => void;
}

type CreateInput = { name: string; ownerUserId?: string; isShared: boolean };

export function EvolutionCreateDialog({ accountId, open, onOpenChange, onCreated }: Props) {
  const integrations = useIntegrations(accountId, open);
  const team = useTeamMembers(accountId);
  const create = useChannelAction<CreateInput, CreateEvolutionResult>(
    accountId,
    "evolution.create",
  );
  const [name, setName] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [shared, setShared] = useState(true);
  const serverReady = isConnected(integrations.data, "evolution");

  function submit(e: FormEvent) {
    e.preventDefault();
    const input: CreateInput = { name: name.trim() || "WhatsApp", isShared: owner ? shared : true };
    if (owner) input.ownerUserId = owner;
    create.mutate(input, {
      onSuccess: (res) => {
        setName("");
        setOwner(null);
        setShared(true);
        onOpenChange(false);
        onCreated(res);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-xl bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandIcon id="whatsapp" size={20} /> WhatsApp por QR Code
          </DialogTitle>
          <DialogDescription>
            {serverReady
              ? "Dê um nome ao número e, se for de um vendedor, diga de quem é."
              : "Antes do primeiro número, informe o endereço e a chave de acesso do servidor que mantém as conexões por QR."}
          </DialogDescription>
        </DialogHeader>

        {integrations.isLoading ? (
          <Loader2
            className="mx-auto size-5 animate-spin text-muted-foreground"
            aria-label="Carregando"
          />
        ) : !serverReady ? (
          <div className="space-y-3">
            {integrations.data?.byProvider["evolution"]?.lastError && (
              <p className="rounded-lg border border-hot-line bg-hot-soft px-3 py-2 text-[12px] text-hot-fg">
                {integrations.data.byProvider["evolution"].lastError}
              </p>
            )}
            <EvolutionServerForm accountId={accountId} state={integrations.data} />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="evo-name">Nome do número</Label>
              <Input
                id="evo-name"
                value={name}
                maxLength={80}
                placeholder="Ex.: WhatsApp da Ana"
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <OwnerSelect
              id="evo-owner"
              members={team.data ?? []}
              value={owner}
              onChange={setOwner}
            />
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="evo-shared">Compartilhar com a equipe</Label>
                <p className="text-[12px] text-muted-foreground">
                  {owner
                    ? "Desligado, só o vendedor e os gestores veem as conversas."
                    : "Sem dono, o número é da equipe toda."}
                </p>
              </div>
              <Switch
                id="evo-shared"
                checked={owner ? shared : true}
                disabled={!owner}
                onCheckedChange={setShared}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {create.isPending ? "Criando…" : "Gerar QR Code"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
