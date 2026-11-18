import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import {
  channelAction,
  isConnected,
  useChannelAction,
  useChannels,
  useIntegrations,
  type Channel,
} from "./api";
import { CAPABILITY_LABEL, SOCIAL_NETWORKS, type SocialNetwork } from "./constants";

type NetState = "connected" | "problem" | "none";

const STATE_PILL: Record<NetState, { label: string; className: string; dot: string | null }> = {
  connected: {
    label: "conectado",
    className: "bg-primary-soft text-foreground",
    dot: "bg-success",
  },
  problem: { label: "com problema", className: "bg-danger/10 text-danger", dot: null },
  none: { label: "não conectado", className: "bg-surface-2 text-muted-foreground", dot: null },
};

function NetworkCard({
  network,
  state,
  disabled,
  busy,
  onConnect,
}: {
  network: SocialNetwork;
  state: NetState;
  disabled: boolean;
  busy: boolean;
  onConnect: () => void;
}) {
  const pill = STATE_PILL[state];
  const cta =
    state === "problem"
      ? "Reconectar"
      : state === "connected"
        ? "Conectar outra conta"
        : "Conectar";
  return (
    <article className="flex flex-col rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-full border border-border">
          <ChannelIcon platform={network.platform} size={18} />
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
            pill.className,
          )}
        >
          {pill.dot && <span className={cn("size-1.5 rounded-full", pill.dot)} aria-hidden />}
          {pill.label}
        </span>
      </div>
      <h3 className="mt-3 text-[14px] font-medium">{network.label}</h3>
      <p className="mt-0.5 text-[11px] font-medium text-subtle">
        {CAPABILITY_LABEL[network.capability]}
      </p>
      <p className="mt-2 line-clamp-3 text-[12px] text-muted-foreground">{network.hint}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4 self-start"
        onClick={onConnect}
        disabled={disabled}
        aria-label={`${cta}: ${network.label}`}
      >
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {cta}
      </Button>
    </article>
  );
}

function stateFor(channels: Channel[] | undefined, platform: string): NetState {
  const mine = (channels ?? []).filter((c) => c.provider === "zernio" && c.platform === platform);
  if (mine.some((c) => c.status === "connected")) return "connected";
  if (mine.some((c) => c.status === "error" || c.status === "disconnected")) return "problem";
  return "none";
}

export function SocialNetworks({
  accountId,
  only,
  returnPath = "/canais?conectado=1",
  compact = false,
}: {
  accountId: string;
  /** Só estas redes (nome na Zernio), por exemplo ["facebook", "instagram"]. */
  only?: string[];
  /** Para onde a rede devolve depois de autorizar. */
  returnPath?: string;
  /** Sem o título da seção (quando quem envolve já explica). */
  compact?: boolean;
}) {
  const integrations = useIntegrations(accountId, true);
  const channels = useChannels(accountId);
  const sync = useChannelAction<Record<string, never>, { synced: number }>(
    accountId,
    "zernio.sync",
  );
  const [connecting, setConnecting] = useState<string | null>(null);
  const ready = isConnected(integrations.data, "zernio");

  async function connect(network: SocialNetwork) {
    setConnecting(network.zernio);
    try {
      const { url } = await channelAction<{ url: string }>(accountId, "zernio.connect_url", {
        platform: network.zernio,
        redirectUrl: `${window.location.origin}${returnPath}`,
      });
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
      setConnecting(null);
    }
  }

  function runSync() {
    sync.mutate(
      {},
      {
        onSuccess: (r) =>
          toast.success(
            r.synced
              ? `${r.synced} ${r.synced === 1 ? "conta sincronizada" : "contas sincronizadas"}`
              : "Nenhuma conta nova na Zernio",
          ),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <section aria-labelledby="more-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className={cn(compact && "sr-only")}>
          <h2 id="more-heading" className="text-[17px] font-medium">
            Mais canais para conectar
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Clique, autorize na rede e volte. A conexão passa pela Zernio.
          </p>
        </div>
        {ready && (
          <Button variant="ghost" size="sm" onClick={runSync} disabled={sync.isPending}>
            {sync.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw aria-hidden />
            )}
            Sincronizar contas da Zernio
          </Button>
        )}
      </div>

      {!integrations.isLoading && !ready && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-muted-foreground">
          {compact
            ? "Primeiro salve a chave da Zernio no passo “WhatsApp”. Com ela, cada rede vira um clique."
            : "Salve a chave da Zernio no passo 1 do WhatsApp Oficial, acima. Com ela, cada rede vira um clique."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOCIAL_NETWORKS.filter((n) => !only || only.includes(n.zernio)).map((n) => (
          <NetworkCard
            key={n.zernio}
            network={n}
            state={stateFor(channels.data, n.platform)}
            disabled={!ready || connecting !== null}
            busy={connecting === n.zernio}
            onConnect={() => void connect(n)}
          />
        ))}
      </div>
    </section>
  );
}
