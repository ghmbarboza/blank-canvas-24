import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { channelAction, channelsKey, type QrPayload } from "./api";
import { QR_POLL_MAX_MS, QR_POLL_MS, QR_REFRESH_MS } from "./constants";
import { explainEvolutionError } from "./evolution-errors";

interface Props {
  accountId: string;
  channelId: string;
  initial?: QrPayload | undefined;
  /** chamado uma vez, quando o celular lê o código e o número conecta */
  onConnected?: () => void;
  className?: string;
}

type Phase = "waiting" | "connected" | "expired";

function qrSrc(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

/**
 * O QR Code do WhatsApp dentro da própria tela (sem janela): mostra o código, troca por um novo
 * sozinho enquanto espera, confere a cada 3 s se o celular já leu e vira "Conectado". Depois de
 * 3 minutos sem leitura o código vence e aparece o botão para gerar outro.
 */
export function QrPanel({ accountId, channelId, initial, onConnected, className }: Props) {
  const qc = useQueryClient();
  const [payload, setPayload] = useState<QrPayload | null>(initial?.qr ? initial : null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const notified = useRef(false);

  const fetchQr = useCallback(
    async (restart: boolean) => {
      if (restart) setRefreshing(true);
      try {
        const next = await channelAction<QrPayload>(accountId, "evolution.qr", { channelId });
        if (next.qr || next.pairingCode) setPayload(next);
        setProblem(null);
        if (restart) {
          startedAt.current = Date.now();
          setPhase("waiting");
        }
      } catch (err) {
        // troca silenciosa que falhou não apaga o código que já está na tela
        if (restart) setProblem(errorMessage(err));
      } finally {
        if (restart) setRefreshing(false);
      }
    },
    [accountId, channelId],
  );

  // Ao abrir: usa o QR que veio da criação ou pede um.
  useEffect(() => {
    startedAt.current = Date.now();
    notified.current = false;
    setPhase("waiting");
    setProblem(null);
    if (initial?.qr) setPayload(initial);
    else void fetchQr(true);
  }, [channelId, initial, fetchQr]);

  // O código do WhatsApp gira: enquanto espera, busca o atual de tempos em tempos.
  useEffect(() => {
    if (phase !== "waiting") return;
    const id = window.setInterval(() => void fetchQr(false), QR_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [phase, fetchQr]);

  useEffect(() => {
    if (phase !== "waiting") return;
    let busy = false;
    const id = window.setInterval(async () => {
      if (busy) return;
      if (Date.now() - startedAt.current > QR_POLL_MAX_MS) {
        setPhase("expired");
        return;
      }
      busy = true;
      try {
        const res = await channelAction<{ status: string }>(accountId, "evolution.status", {
          channelId,
        });
        if (res.status === "connected") {
          setPhase("connected");
          void qc.invalidateQueries({ queryKey: channelsKey(accountId) });
          void qc.invalidateQueries({ queryKey: ["setup"] });
          if (!notified.current) {
            notified.current = true;
            onConnected?.();
          }
        }
      } catch {
        // falha pontual de rede: tenta de novo no próximo ciclo
      } finally {
        busy = false;
      }
    }, QR_POLL_MS);
    return () => window.clearInterval(id);
  }, [accountId, channelId, phase, qc, onConnected]);

  if (phase === "connected")
    return (
      <div
        role="status"
        className={cn("flex flex-col items-center gap-3 py-6 text-center", className)}
      >
        <span className="grid size-16 place-items-center rounded-full bg-primary-soft">
          <CheckCircle2 className="size-9 text-foreground" aria-hidden />
        </span>
        <p className="text-[16px] font-semibold">WhatsApp conectado</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">
          As mensagens novas já chegam na Caixa de entrada.
        </p>
      </div>
    );

  const help = problem ? explainEvolutionError(problem) : null;
  return (
    <div className={cn("space-y-4", className)}>
      <div className="mx-auto grid size-60 max-w-full place-items-center rounded-xl border border-border bg-white p-3">
        {phase === "expired" ? (
          <p className="px-4 text-center text-[13px] text-[var(--via-gray-600)]">
            O QR Code venceu. Gere outro e leia com o celular.
          </p>
        ) : payload?.qr ? (
          <img
            src={qrSrc(payload.qr)}
            alt="QR Code para conectar o WhatsApp"
            className="size-full object-contain"
          />
        ) : help ? (
          <p className="px-4 text-center text-[13px] text-[var(--via-gray-600)]">
            Não consegui gerar o QR Code.
          </p>
        ) : (
          <Loader2
            className="size-6 animate-spin text-[var(--via-gray-400)]"
            aria-label="Gerando o QR Code"
          />
        )}
      </div>

      {help ? (
        <p
          role="alert"
          className="rounded-lg border border-hot-line bg-hot-soft px-3 py-2 text-[13px] text-hot-fg"
        >
          <span className="font-medium">{help.title}.</span> {help.fix}
        </p>
      ) : null}

      {payload?.pairingCode && phase === "waiting" ? (
        <p className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Smartphone className="size-4" aria-hidden />
          Ou use o código
          <code className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[14px] font-semibold tracking-widest text-foreground">
            {payload.pairingCode}
          </code>
        </p>
      ) : null}

      {phase === "waiting" && !help ? (
        <p
          className="flex items-center justify-center gap-2 text-[12px] text-subtle"
          aria-live="polite"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-warm" aria-hidden />
          Esperando você ler o código. A tela muda sozinha quando conectar.
        </p>
      ) : null}

      <div className="flex justify-center">
        <Button
          type="button"
          variant={phase === "expired" || help ? "default" : "outline"}
          size="sm"
          onClick={() => void fetchQr(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw aria-hidden />
          )}
          Gerar outro QR Code
        </Button>
      </div>
    </div>
  );
}
