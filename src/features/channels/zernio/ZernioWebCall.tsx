import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/functions";

import { zernio } from "../zernio-api";

type Phase = "idle" | "connecting" | "ringing" | "live";

interface CallLike {
  state: string;
  answer: () => void;
  hangup: () => void;
}

interface ClientLike {
  on: (ev: string, cb: (n: { type?: string; call?: CallLike }) => void) => void;
  connect: () => void;
  disconnect: () => void;
  remoteElement?: string;
}

const LABEL: Record<Phase, string> = {
  idle: "Pronto para ligar",
  connecting: "Conectando o navegador…",
  ringing: "Chamando…",
  live: "Em ligação",
};

/**
 * Softphone do navegador pela Zernio (WebRTC, @telnyx/webrtc): o servidor cria a sessão, o
 * navegador registra, o servidor disca e a perna atendida chega aqui. O SDK só carrega ao ligar.
 */
export function ZernioWebCall({
  accountId,
  fromNumber,
  defaultTo = "",
}: {
  accountId: string;
  fromNumber?: string | null;
  defaultTo?: string;
}) {
  const [to, setTo] = useState(defaultTo);
  const [phase, setPhase] = useState<Phase>("idle");
  const client = useRef<ClientLike | null>(null);
  const call = useRef<CallLike | null>(null);
  const zernioCallId = useRef<string | null>(null);
  const callToken = useRef<string | null>(null);
  const audioId = { current: `zernio-audio-${useId().replace(/:/g, "")}` };

  useEffect(() => () => client.current?.disconnect(), []);

  function reset() {
    call.current = null;
    zernioCallId.current = null;
    callToken.current = null;
    client.current?.disconnect();
    client.current = null;
    setPhase("idle");
  }

  async function start() {
    setPhase("connecting");
    try {
      const session = await zernio<{ token: string; credentialId: string }>(
        accountId,
        "web.session",
      );
      const { TelnyxRTC } = await import("@telnyx/webrtc");
      const c = new TelnyxRTC({ login_token: session.token }) as unknown as ClientLike;
      c.remoteElement = audioId.current;
      client.current = c;
      c.on("telnyx.ready", () => {
        setPhase("ringing");
        zernio<{ callId: string | null; callToken: string | null }>(accountId, "web.dial", {
          credentialId: session.credentialId,
          to,
          ...(fromNumber ? { fromNumber } : {}),
        })
          .then((r) => {
            zernioCallId.current = r.callId;
            callToken.current = r.callToken;
          })
          .catch((err: unknown) => {
            toast.error(errorMessage(err));
            reset();
          });
      });
      c.on("telnyx.error", () => {
        toast.error("O navegador não conseguiu registrar a ligação. Confira o microfone.");
        reset();
      });
      c.on("telnyx.notification", (n) => {
        if (n.type !== "callUpdate" || !n.call) return;
        if (n.call.state === "ringing") {
          call.current = n.call;
          n.call.answer();
        }
        if (n.call.state === "active") setPhase("live");
        if (n.call.state === "destroy" || n.call.state === "hangup") reset();
      });
      c.connect();
    } catch (err) {
      toast.error(errorMessage(err));
      reset();
    }
  }

  function hangup() {
    call.current?.hangup();
    if (zernioCallId.current)
      void zernio(accountId, "call.end", {
        zernioCallId: zernioCallId.current,
        callToken: callToken.current,
      }).catch(() => null);
    reset();
  }

  const busy = phase !== "idle";
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`${audioId.current}-to`}>Ligar para</Label>
          <Input
            id={`${audioId.current}-to`}
            inputMode="tel"
            placeholder="(48) 99999-0000"
            value={to}
            disabled={busy}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        {busy ? (
          <Button variant="destructive" onClick={hangup} aria-label="Desligar">
            <PhoneOff aria-hidden /> Desligar
          </Button>
        ) : (
          <Button onClick={() => void start()} disabled={to.replace(/\D/g, "").length < 10}>
            <Phone aria-hidden /> Ligar pelo navegador
          </Button>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground" aria-live="polite">
        {phase === "connecting" || phase === "ringing" ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : null}
        {LABEL[phase]}
        {fromNumber ? ` · saindo de ${fromNumber}` : ""}
      </p>
      <audio id={audioId.current} autoPlay className="hidden" />
    </div>
  );
}
