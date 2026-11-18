// Passo do assistente de configuração: WhatsApp oficial pela Zernio e número real.
import { useMemo } from "react";
import { isConnected, useChannels, useIntegrations } from "./api";
import { useZernioNumbers } from "./zernio-api";

export interface ZernioSetupStatus {
  done: boolean;
  summary: string;
  loading: boolean;
}

/** Concluído quando há WhatsApp da Zernio conectado e um número real ativo. */
export function useZernioSetupStatus(accountId: string): ZernioSetupStatus {
  const integrations = useIntegrations(accountId, true);
  const channels = useChannels(accountId);
  const numbers = useZernioNumbers(accountId);
  return useMemo(() => {
    const loading = integrations.isLoading || channels.isLoading || numbers.isLoading;
    const keyOk = isConnected(integrations.data, "zernio");
    const wa = (channels.data ?? []).filter(
      (c) => c.provider === "zernio" && c.platform === "whatsapp" && c.status === "connected",
    );
    const active = (numbers.data ?? []).filter((n) => n.status === "active");
    const pending = (numbers.data ?? []).filter((n) => n.status === "pending_regulatory");
    let summary: string;
    if (!keyOk) summary = "Falta a chave da Zernio";
    else if (!wa.length) summary = "Chave ok. Falta conectar o WhatsApp";
    else if (active.length)
      summary = `WhatsApp ${wa[0]?.handle ?? "conectado"} e ${active.length} ${active.length === 1 ? "número ativo" : "números ativos"}`;
    else if (pending.length) summary = "WhatsApp conectado. Número em análise (1 a 3 dias úteis)";
    else summary = "WhatsApp conectado. Falta o número real";
    return { done: keyOk && wa.length > 0 && active.length > 0, summary, loading };
  }, [
    integrations.isLoading,
    integrations.data,
    channels.isLoading,
    channels.data,
    numbers.isLoading,
    numbers.data,
  ]);
}
