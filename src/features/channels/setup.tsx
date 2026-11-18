// Passo do assistente de configuração: WhatsApp oficial pela Zernio e número real.
import { CheckCircle2, CircleDashed } from "lucide-react";

import { BrandTile } from "@/components/brand/BrandIcon";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { AddWhatsApp } from "./AddWhatsApp";
import { isConnected, useChannels, useIntegrations } from "./api";
import { useZernioSetupStatus } from "./setup-status";
import { NumbersSection } from "./zernio/NumbersSection";

function Check({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className="flex items-center gap-2 text-[13px]">
      {ok ? (
        <CheckCircle2 className="size-4 text-foreground" aria-hidden />
      ) : (
        <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

/** Passo inteiro e autoexplicativo: chave (com Testar), WhatsApp oficial e número real. */
export function ZernioSetupStep({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const status = useZernioSetupStatus(accountId);
  const integrations = useIntegrations(accountId, true);
  const channels = useChannels(accountId);
  const keyOk = isConnected(integrations.data, "zernio");
  const waOk = (channels.data ?? []).some(
    (c) => c.provider === "zernio" && c.platform === "whatsapp" && c.status === "connected",
  );

  if (status.loading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BrandTile id="zernio" size={32} />
          <BrandTile id="whatsapp" size={32} />
        </div>
        <p className="text-[13px] text-muted-foreground">
          Seus clientes falam e ligam no mesmo número. A conta da Zernio é da sua empresa: a Meta e
          a Zernio cobram direto de você.
        </p>
        <ul className="space-y-1.5 pt-1">
          <Check ok={keyOk}>Chave da Zernio testada</Check>
          <Check ok={waOk}>WhatsApp conectado</Check>
          <Check ok={status.done}>Número real ativo</Check>
        </ul>
      </div>
      <AddWhatsApp accountId={accountId} onEvolutionCreated={() => undefined} />
      {keyOk && <NumbersSection accountId={accountId} isAdmin />}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button onClick={onDone} disabled={!waOk}>
          {status.done ? "Concluir" : "Continuar"}
        </Button>
        <span className="text-[12px] text-muted-foreground">{status.summary}</span>
      </div>
    </div>
  );
}
