import { useCallback, useEffect, useRef, useState } from "react";
import { BrandIcon } from "@/components/brand/BrandIcon";
import { CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
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
import { errorMessage } from "@/lib/functions";
import { channelAction, channelsKey, type QrPayload } from "./api";
import { QR_POLL_MAX_MS, QR_POLL_MS } from "./constants";

interface Props {
  accountId: string;
  channelId: string | null;
  initial?: QrPayload | undefined;
  onOpenChange: (open: boolean) => void;
}

type Phase = "waiting" | "connected" | "timeout";

function qrSrc(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

// Mostra o QR da instância e consulta o status a cada 3 s até conectar (máx. 3 min).
export function QrDialog({ accountId, channelId, initial, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [payload, setPayload] = useState<QrPayload | null>(initial ?? null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [refreshing, setRefreshing] = useState(false);
  const startedAt = useRef(Date.now());

  const fetchQr = useCallback(async () => {
    if (!channelId) return;
    setRefreshing(true);
    try {
      const next = await channelAction<QrPayload>(accountId, "evolution.qr", { channelId });
      setPayload(next);
      startedAt.current = Date.now();
      setPhase("waiting");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [accountId, channelId]);

  // Ao abrir: usa o QR que veio da criação ou pede um novo.
  useEffect(() => {
    if (!channelId) return;
    startedAt.current = Date.now();
    setPhase("waiting");
    if (initial?.qr) setPayload(initial);
    else void fetchQr();
  }, [channelId, initial, fetchQr]);

  useEffect(() => {
    if (!channelId || phase !== "waiting") return;
    let busy = false;
    const id = window.setInterval(async () => {
      if (busy) return;
      if (Date.now() - startedAt.current > QR_POLL_MAX_MS) {
        setPhase("timeout");
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
          toast.success("WhatsApp conectado");
        }
      } catch {
        // falha pontual de rede: tenta de novo no próximo ciclo
      } finally {
        busy = false;
      }
    }, QR_POLL_MS);
    return () => window.clearInterval(id);
  }, [accountId, channelId, phase, qc]);

  return (
    <Dialog open={Boolean(channelId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandIcon id="whatsapp" size={20} />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            No celular, abra o WhatsApp › Dispositivos conectados › Conectar dispositivo e aponte
            para o código.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {phase === "connected" ? (
            <motion.div
              key="ok"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-3 py-8 text-center"
              role="status"
            >
              <motion.span
                initial={{ scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 14 }}
                className="grid size-16 place-items-center rounded-full bg-primary-soft"
              >
                <CheckCircle2 className="size-9 text-foreground" aria-hidden />
              </motion.span>
              <p className="text-[15px] font-semibold">Número conectado</p>
              <p className="max-w-xs text-[13px] text-muted-foreground">
                As conversas novas já chegam na caixa de entrada. Grupos podem ser sincronizados no
                menu do canal.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="qr"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="mx-auto grid size-64 place-items-center rounded-xl border border-border bg-white p-3">
                {payload?.qr && phase === "waiting" ? (
                  <img
                    src={qrSrc(payload.qr)}
                    alt="QR Code para conectar o WhatsApp"
                    className="size-full object-contain"
                  />
                ) : phase === "timeout" ? (
                  <p className="px-6 text-center text-[13px] text-[var(--via-gray-600)]">
                    O código expirou. Gere um novo para tentar de novo.
                  </p>
                ) : (
                  <Loader2
                    className="size-6 animate-spin text-[var(--via-gray-400)]"
                    aria-label="Gerando QR"
                  />
                )}
              </div>
              {payload?.pairingCode && phase === "waiting" && (
                <div className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
                  <Smartphone className="size-4" aria-hidden />
                  Ou use o código
                  <code className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[14px] font-semibold tracking-widest text-foreground">
                    {payload.pairingCode}
                  </code>
                </div>
              )}
              {phase === "waiting" && (
                <p
                  className="flex items-center justify-center gap-2 text-[12px] text-subtle"
                  aria-live="polite"
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-warm" aria-hidden />
                  Aguardando a leitura do código…
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter className="gap-2">
          {phase === "connected" ? (
            <Button onClick={() => onOpenChange(false)}>Concluir</Button>
          ) : (
            <Button variant="outline" onClick={fetchQr} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              Gerar novo QR
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
