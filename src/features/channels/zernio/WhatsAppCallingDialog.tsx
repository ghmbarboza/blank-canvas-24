import { useState } from "react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { Loader2, Smartphone } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/functions";

import type { Channel } from "../api";
import { CopyField } from "../CopyField";
import { useCalling, useSaveCalling, type CallingState } from "../zernio-api";
import { buildForwardTo, parseForwardTo, type ForwardChoice } from "../zernio-rules";
import { ForwardPicker } from "./ForwardPicker";

/** Ligação pelo WhatsApp num número da Zernio: liga e escolhe quem atende. */
export function WhatsAppCallingDialog({
  accountId,
  channel,
  onClose,
}: {
  accountId: string;
  channel: Channel | null;
  onClose: () => void;
}) {
  const calling = useCalling(accountId, channel?.id ?? "", Boolean(channel));
  return (
    <Dialog open={Boolean(channel)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandIcon id="whatsapp" size={20} />
            Ligação pelo WhatsApp
          </DialogTitle>
          <DialogDescription>
            O cliente toca em "ligar" dentro da conversa e a ligação cai onde você escolher. Ligação
            recebida não tem custo da Meta.
          </DialogDescription>
        </DialogHeader>
        {calling.isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : calling.isError ? (
          <p className="text-[13px] text-danger">{errorMessage(calling.error)}</p>
        ) : calling.data?.coexistence ? (
          <div className="flex gap-2 rounded-lg bg-surface-2 p-3 text-[13px]">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p>
              Este número continua no app do celular (coexistência) e, nesse modo, a Meta não deixa
              atender ligação pela API. Para ligar, conecte de novo sem manter no celular.
            </p>
          </div>
        ) : channel && calling.data ? (
          <CallingForm
            key={channel.id}
            accountId={accountId}
            channelId={channel.id}
            state={calling.data}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CallingForm({
  accountId,
  channelId,
  state,
  onClose,
}: {
  accountId: string;
  channelId: string;
  state: CallingState;
  onClose: () => void;
}) {
  const [forward, setForward] = useState<ForwardChoice>(() => {
    const parsed = parseForwardTo(state.forwardTo);
    return parsed.kind === "none" ? { kind: "ai", phone: state.phoneNumber ?? "" } : parsed;
  });
  const [recording, setRecording] = useState(Boolean(state.recordingEnabled));
  const [maxMinutes, setMaxMinutes] = useState(
    state.maxCallDurationSeconds ? Math.round(state.maxCallDurationSeconds / 60) : 30,
  );
  const save = useSaveCalling(accountId, channelId);
  const ok = buildForwardTo(forward).ok;

  function submit() {
    save.mutate(
      { forward, recording, maxMinutes },
      {
        onSuccess: () => {
          toast.success("Ligação pelo WhatsApp ligada");
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <>
      <div className="space-y-5">
        <p className="text-[13px]">
          Status:{" "}
          <span className="font-medium">{state.callingEnabled ? "ligada" : "desligada"}</span>
        </p>
        <ForwardPicker
          id={`wa-${channelId}`}
          value={forward}
          onChange={setForward}
          ownNumber={state.phoneNumber ?? null}
          allowNone={false}
        />
        <div className="flex items-start justify-between gap-3">
          <Label htmlFor="wa-rec" className="cursor-pointer">
            <span className="block text-[13px] font-medium">Gravar com aviso</span>
            <span className="block text-[12px] font-normal text-muted-foreground">
              Toca um aviso antes de gravar. US$ 0,004 por minuto.
            </span>
          </Label>
          <Switch id="wa-rec" checked={recording} onCheckedChange={setRecording} />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="wa-max" className="text-[13px]">
            Encerrar depois de
          </Label>
          <Input
            id="wa-max"
            type="number"
            min={1}
            max={240}
            className="w-20"
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(Number(e.target.value) || 30)}
          />
          <span className="text-[13px] text-muted-foreground">minutos</span>
        </div>
        {state.callDeepLink && (
          <CopyField
            label="Link para o cliente ligar (site, e-mail, QR)"
            value={state.callDeepLink}
          />
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={save.isPending || !ok}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {state.callingEnabled ? "Salvar" : "Ligar a ligação pelo WhatsApp"}
        </Button>
      </DialogFooter>
    </>
  );
}
