import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSoftphone } from "@/features/telephony/softphone/softphone-context";
import { useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useSuperviseInfo, useSupervisorEnable, type LiveAgent } from "./api";
import { SUPERVISE_LABEL, type SuperviseMode } from "./lib";

const MODES: SuperviseMode[] = ["listen", "whisper", "barge"];
const MODE_HINT: Record<SuperviseMode, string> = {
  listen: "Você ouve; ninguém ouve você.",
  whisper: "Só o atendente ouve você. O cliente não.",
  barge: "Você entra na conversa com os dois.",
};

/**
 * Escuta, sussurro e entrada na ligação. A API da Zadarma não controla a ligação em andamento;
 * o recurso é da PABX: o supervisor (com modo supervisor ligado no ramal) disca 007, o ramal do
 * atendente e 4, 5 ou 6. Esta tela liga o modo supervisor por API e mostra o passo a passo.
 */
export function SuperviseDialog({ agent, onClose }: { agent: LiveAgent; onClose: () => void }) {
  const accountId = useAccountId();
  const [mode, setMode] = useState<SuperviseMode>("listen");
  const info = useSuperviseInfo(accountId);
  const enable = useSupervisorEnable(accountId);
  const sp = useSoftphone();
  const { mutate } = info;
  useEffect(() => {
    mutate({ userId: agent.user_id, mode });
  }, [agent.user_id, mode, mutate]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Supervisionar {agent.name}</DialogTitle>
          <DialogDescription>
            {agent.current_voice?.subject ?? "Ligação em andamento"}
          </DialogDescription>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          A Zadarma não deixa o Vínculo entrar sozinho numa ligação em andamento. Por isso a escuta
          sai do seu ramal: o Vínculo liga o modo supervisor e mostra o código para discar.
        </p>
        <div role="radiogroup" aria-label="Modo" className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-xl border p-3 text-left text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                mode === m
                  ? "border-primary bg-primary-soft text-foreground"
                  : "border-border hover:bg-surface-2",
              )}
            >
              <span className="block font-semibold">{SUPERVISE_LABEL[m]}</span>
              <span
                className={cn(
                  "text-[11px]",
                  mode === m ? "text-primary-foreground/75" : "text-muted-foreground",
                )}
              >
                {MODE_HINT[m]}
              </span>
            </button>
          ))}
        </div>
        {info.isPending ? (
          <Loader2 className="mx-auto size-5 animate-spin text-subtle" />
        ) : info.isError ? (
          <p className="text-[13px] text-danger">{errorMessage(info.error)}</p>
        ) : info.data ? (
          <div className="space-y-3">
            {!info.data.my_extension ? (
              <p className="rounded-lg bg-surface-2 p-3 text-[13px]">
                Você precisa de um ramal na Zadarma para supervisionar. Crie em Ajustes › Telefonia.
              </p>
            ) : info.data.supervisor_enabled === false ? (
              <div className="rounded-lg bg-surface-2 p-3 text-[13px]">
                <p>O modo supervisor ainda está desligado no seu ramal {info.data.my_extension}.</p>
                <Button
                  size="sm"
                  className="mt-2 rounded-full"
                  disabled={enable.isPending}
                  onClick={() =>
                    enable.mutate(undefined, {
                      onSuccess: () => {
                        toast.success("Modo supervisor ligado no seu ramal");
                        mutate({ userId: agent.user_id, mode });
                      },
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <ShieldCheck className="size-4" /> Ligar modo supervisor
                </Button>
              </div>
            ) : null}
            <ol className="list-decimal space-y-1.5 pl-5 text-[14px]">
              {info.data.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {sp && (
              <Button variant="outline" className="rounded-full" onClick={() => sp.setOpen(true)}>
                Abrir meu telefone
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
