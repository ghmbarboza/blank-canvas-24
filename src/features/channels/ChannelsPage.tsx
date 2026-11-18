import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAccount, useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { channelsKey, type QrPayload } from "./api";
import { LegacyWhatsApp, OfficialWhatsApp, WhatsAppQrCard } from "./AddWhatsApp";
import { ConnectedChannels } from "./ConnectedChannels";
import { IntegrationsSection } from "./IntegrationsSection";
import { ZernioHub } from "./ZernioHub";
import { zernioHubKey } from "./zernio-catalog";
import { ZernioLeadsCard } from "./ZernioLeadsCard";
import { WhatsAppPricingCard } from "./WhatsAppPricingCard";
import { QrDialog } from "./QrDialog";
import { NumbersSection } from "./zernio/NumbersSection";
import type { ZernioReturn } from "./zernio/return";
import { useWhatsAppConnected, zernio } from "./zernio-api";

interface Props {
  // Voltou do OAuth da Zernio (?conectado=1)
  returnedFromConnect: boolean;
  zernioReturn: ZernioReturn | null;
  onReturnHandled: () => void;
}

// Volta do cadastro hospedado do WhatsApp (ou do KYC do número): registra o canal uma vez.
function useZernioHostedReturn(
  accountId: string,
  ret: ZernioReturn | null,
  isAdmin: boolean,
  done: () => void,
) {
  const connected = useWhatsAppConnected(accountId);
  const handled = useRef(false);
  useEffect(() => {
    if (!ret || handled.current) return;
    handled.current = true;
    done();
    if (ret.kind === "kyc") {
      if (ret.submitted)
        toast.success("Documentos enviados. O número ativa em 1 a 3 dias úteis; avisamos aqui.");
      return;
    }
    if (ret.error) {
      toast.error(ret.error);
      return;
    }
    if (!isAdmin) return;
    const id = toast.loading("Registrando o WhatsApp que você conectou…");
    connected
      .mutateAsync({ zernioAccountId: ret.zernioAccountId, coexistence: ret.coexistence })
      .then(() =>
        toast.success("WhatsApp conectado. As mensagens novas já chegam na caixa de entrada.", {
          id,
        }),
      )
      .catch((err: unknown) => toast.error(errorMessage(err), { id }));
  }, [ret, isAdmin, done, connected]);
}

// Ao voltar da autorização da rede, puxa as contas novas da Zernio uma vez.
function useZernioReturn(accountId: string, active: boolean, isAdmin: boolean, done: () => void) {
  const qc = useQueryClient();
  const handled = useRef(false);
  useEffect(() => {
    if (!active || handled.current) return;
    handled.current = true;
    done();
    if (!isAdmin) return;
    const id = toast.loading("Conferindo na Zernio o que você conectou…");
    // a Central pergunta à Zernio ao vivo e já traz os canais de mensagem novos
    zernio<{ accounts: { active: boolean }[] }>(accountId, "hub")
      .then((r) => {
        const n = (r.accounts ?? []).filter((a) => a.active).length;
        toast.success(
          n
            ? `Conferido na Zernio: ${n} ${n === 1 ? "conta conectada" : "contas conectadas"}.`
            : "Nada conectado ainda. Se a autorização não terminou, tente de novo.",
          { id },
        );
        void qc.invalidateQueries({ queryKey: channelsKey(accountId) });
        void qc.invalidateQueries({ queryKey: zernioHubKey(accountId) });
      })
      .catch((err: unknown) => toast.error(errorMessage(err), { id }));
  }, [accountId, active, isAdmin, done, qc]);
}

export function ChannelsPage({ returnedFromConnect, zernioReturn, onReturnHandled }: Props) {
  const accountId = useAccountId();
  const { isAdmin } = useAccount();
  const [qr, setQr] = useState<{ channelId: string; initial?: QrPayload } | null>(null);
  // quem chega por um link para #whatsapp-oficial já encontra o bloco aberto
  const [openOfficial] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#whatsapp-oficial",
  );
  useZernioReturn(accountId, returnedFromConnect, isAdmin, onReturnHandled);
  useZernioHostedReturn(accountId, zernioReturn, isAdmin, onReturnHandled);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-8 sm:px-8 sm:py-10 lg:px-10">
          <div className="max-w-2xl">
            <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Configuração
            </p>
            <h1 className="font-display text-[30px] leading-[1.1] font-medium text-foreground sm:text-[34px]">
              Canais de atendimento
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
              Conecte o WhatsApp da empresa e os outros lugares onde seus clientes falam com você.
              Todas as conversas chegam numa caixa só.
            </p>
          </div>

          <ConnectedChannels
            accountId={accountId}
            isAdmin={isAdmin}
            onShowQr={(channelId) => setQr({ channelId })}
          />

          {isAdmin ? (
            <>
              <div id="whatsapp-qr" className="scroll-mt-6">
                <WhatsAppQrCard accountId={accountId} />
              </div>
              <div id="whatsapp-oficial" className="scroll-mt-6">
                <OfficialWhatsApp
                  accountId={accountId}
                  defaultOpen={returnedFromConnect || zernioReturn !== null || openOfficial}
                />
              </div>
              <ZernioHub accountId={accountId} />
              <div id="leads-de-anuncios">
                <ZernioLeadsCard accountId={accountId} withConnect={false} />
              </div>
              <LegacyWhatsApp accountId={accountId} />
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-[13px] text-muted-foreground">
              <Lock className="size-4 shrink-0" aria-hidden />
              Só donos e administradores conectam canais. Peça a um deles para adicionar o número ou
              a rede.
            </div>
          )}

          <NumbersSection accountId={accountId} isAdmin={isAdmin} />

          <WhatsAppPricingCard />

          <IntegrationsSection isAdmin={isAdmin} />
        </div>
      </div>

      <QrDialog
        accountId={accountId}
        channelId={qr?.channelId ?? null}
        initial={qr?.initial}
        onOpenChange={(open) => !open && setQr(null)}
      />
    </div>
  );
}
