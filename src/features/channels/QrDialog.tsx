import { useState } from "react";

import { BrandIcon } from "@/components/brand/BrandIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { QrPayload } from "./api";
import { QrPanel } from "./QrPanel";

interface Props {
  accountId: string;
  channelId: string | null;
  initial?: QrPayload | undefined;
  onOpenChange: (open: boolean) => void;
}

// Janela do QR de um número que já existe na lista (reconectar). A conexão nova usa o QrPanel
// direto na tela, sem janela.
export function QrDialog({ accountId, channelId, initial, onOpenChange }: Props) {
  const [connected, setConnected] = useState(false);
  return (
    <Dialog
      open={Boolean(channelId)}
      onOpenChange={(open) => {
        if (!open) setConnected(false);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto rounded-xl bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandIcon id="whatsapp" size={20} />
            Conectar o WhatsApp
          </DialogTitle>
          <DialogDescription>
            No celular, abra o WhatsApp › Dispositivos conectados › Conectar dispositivo e aponte
            para o código.
          </DialogDescription>
        </DialogHeader>
        {channelId ? (
          <QrPanel
            key={channelId}
            accountId={accountId}
            channelId={channelId}
            initial={initial}
            onConnected={() => setConnected(true)}
          />
        ) : null}
        {connected ? (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Concluir</Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
