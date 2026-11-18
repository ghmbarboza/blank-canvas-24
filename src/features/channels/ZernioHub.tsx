// Central da Zernio: com a chave única, o Nexus pergunta à Zernio o que está conectado (mensagens,
// redes e todas as contas de anúncio) e oferece um botão para cada opção que falta. O botão abre
// o cadastro da própria Zernio (inclusive o login do Google e da Microsoft); na volta (?conectado=1) a lista é conferida de novo.
// DS SUBIDO: resumo "N de M" com a fileira de logos (pendente em cinza), um cartão por grupo,
// selo navy para conectado e coral para desconectado (nunca semáforo), texto ≥ 13px.
import { useState } from "react";
import { ArrowUp, ExternalLink, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { BrandTile } from "@/components/brand/BrandIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { channelsKey } from "./api";
import {
  ZERNIO_GROUPS,
  zernioHubKey,
  optionStates,
  type OptionState,
  type ZernioAccountLite,
} from "./zernio-catalog";
import { zernio } from "./zernio-api";

interface HubData {
  ready: boolean;
  profile: boolean;
  accounts: ZernioAccountLite[];
}

/** Ícone do kit para cada opção (Meta Ads usa a marca Meta; Google Ads, a do Google Ads). */
const ICON: Record<string, string> = {
  facebook: "messenger",
  metaads: "meta",
  googleads: "google_ads",
  tiktokads: "tiktok",
  linkedinads: "linkedin",
  pinterestads: "pinterest",
  xads: "x",
  redditads: "reddit",
  microsoftads: "microsoft",
  twitter: "x",
  googlebusiness: "google_business",
};

const iconOf = (s: OptionState) => ICON[s.option.id] ?? s.option.icon;

/** Sem nada conectado, a primeira opção recomendada (uma só, Von Restorff). */
const START_HERE = "whatsapp";

const CARD = "rounded-[var(--via-radius-lg)] border border-[var(--via-border-soft)] bg-surface";

export function ZernioHub({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const hub = useQuery({
    queryKey: zernioHubKey(accountId),
    queryFn: () => zernio<HubData>(accountId, "hub"),
    staleTime: 30_000,
    retry: false,
  });
  const [opening, setOpening] = useState<string | null>(null);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: zernioHubKey(accountId) });
    await qc.invalidateQueries({ queryKey: channelsKey(accountId) });
  }

  async function connect(s: OptionState) {
    setOpening(s.option.id);
    try {
      const r = await zernio<{ url?: string; alreadyConnected?: boolean; name?: string }>(
        accountId,
        "hub.connect",
        {
          option: s.option.id,
          redirectUrl: `${window.location.origin}/canais?conectado=1`,
        },
      );
      if (r.alreadyConnected) {
        toast.success(
          `${s.option.label} já estava conectado na Zernio${r.name ? `: ${r.name}` : ""}`,
        );
        await refresh();
        setOpening(null);
        return;
      }
      if (r.url) window.location.assign(r.url);
      else setOpening(null);
    } catch (err) {
      toast.error(errorMessage(err));
      setOpening(null);
    }
  }

  const data = hub.data;
  const states = optionStates(data?.accounts ?? []);
  const connected = states.filter((s) => s.status === "connected").length;
  const nothingYet = Boolean(data?.ready) && data?.accounts.length === 0;

  return (
    <section aria-labelledby="zernio-hub-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandTile id="zernio" size={36} />
          <div>
            <h2 id="zernio-hub-title" className="text-[17px] font-medium text-foreground">
              Tudo pela Zernio
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Uma chave só conecta WhatsApp, redes sociais, todas as contas de anúncio e a agenda do
              Google ou da Microsoft.
            </p>
          </div>
        </div>
        {data?.ready && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={hub.isFetching}
          >
            {hub.isFetching ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw aria-hidden />
            )}
            Conferir na Zernio
          </Button>
        )}
      </div>

      {hub.isPending ? (
        <div className={cn(CARD, "h-40 animate-pulse bg-surface-2")} />
      ) : hub.isError ? (
        <div className="rounded-[var(--via-radius-lg)] border border-danger/30 bg-danger/5 px-5 py-4">
          <p className="text-[14px] font-medium text-foreground">
            Não deu para conferir na Zernio agora
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {errorMessage(hub.error)} Confira a chave no passo 1 e toque em “Conferir na Zernio”.
          </p>
        </div>
      ) : !data?.ready ? (
        <NotReady />
      ) : (
        <>
          <Summary states={states} connected={connected} nothingYet={nothingYet} />
          {!data.profile && (
            <p className="flex items-start gap-2 rounded-[var(--via-radius-lg)] border border-danger/30 bg-danger/5 px-4 py-3 text-[13px] text-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              Falta um perfil na Zernio para conectar contas novas. Crie em zernio.com › Profiles e
              toque em “Conferir na Zernio”.
            </p>
          )}
          <div className="grid gap-4">
            {ZERNIO_GROUPS.map((g) => {
              const items = states.filter((s) => s.option.group === g.id);
              const ok = items.filter((s) => s.status === "connected").length;
              return (
                <article key={g.id} className={cn(CARD, "overflow-hidden")}>
                  <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--via-border-soft)] px-5 py-3.5">
                    <div>
                      <h3 className="eyebrow text-subtle">{g.label}</h3>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">{g.hint}</p>
                    </div>
                    <span className="text-[13px] text-muted-foreground tabular-nums">
                      {ok} de {items.length}
                    </span>
                  </header>
                  <ul className="grid grid-cols-1 divide-y divide-[var(--via-border-soft)] md:grid-cols-2 md:divide-y-0">
                    {items.map((s) => (
                      <OptionRow
                        key={s.option.id}
                        s={s}
                        startHere={nothingYet && s.option.id === START_HERE}
                        busy={opening === s.option.id}
                        disabled={opening !== null || !data.profile}
                        onConnect={() => void connect(s)}
                      />
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/** Sem chave: progresso + próximo passo, nunca uma lista de "não conectado". */
function NotReady() {
  return (
    <div className={cn(CARD, "flex flex-wrap items-center gap-4 px-5 py-4")}>
      <span className="flex shrink-0 -space-x-2" aria-hidden>
        {["whatsapp", "instagram", "messenger", "meta", "google_ads"].map((id) => (
          <BrandTile key={id} id={id} size={32} className="ring-2 ring-[var(--via-surface)]" />
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-foreground">
          Falta só a chave da Zernio para ver tudo aqui
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Salve a chave no passo 1 do WhatsApp Oficial, acima. Na hora, o Nexus confere o que já
          está conectado e mostra um botão para cada rede que falta.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          document
            .getElementById("whatsapp-oficial")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      >
        <ArrowUp aria-hidden />
        Ir para a chave
      </Button>
    </div>
  );
}

function Summary({
  states,
  connected,
  nothingYet,
}: {
  states: OptionState[];
  connected: number;
  nothingYet: boolean;
}) {
  return (
    <div className={cn(CARD, "flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4")}>
      {nothingYet ? (
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-foreground">
            Chave conferida. Nada conectado ainda.
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Comece pelo WhatsApp: é onde a maioria dos clientes chama. Depois, as redes e os
            anúncios.
          </p>
        </div>
      ) : (
        <div className="shrink-0">
          <p className="font-display text-[30px] leading-none font-semibold text-foreground tabular-nums">
            {connected}{" "}
            <span className="text-[17px] font-medium text-muted-foreground">
              de {states.length}
            </span>
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">conectadas na sua Zernio</p>
        </div>
      )}
      <ul className="flex flex-wrap gap-1.5" aria-label="Situação de cada opção">
        {states.map((s) => (
          <li key={s.option.id} title={`${s.option.label}: ${STATUS_LABEL[s.status]}`}>
            <BrandTile
              id={iconOf(s)}
              size={26}
              className={cn(s.status === "none" && "opacity-40 grayscale")}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_LABEL: Record<OptionState["status"], string> = {
  connected: "conectado",
  problem: "desconectado",
  none: "não conectado",
};

function OptionRow({
  s,
  startHere,
  busy,
  disabled,
  onConnect,
}: {
  s: OptionState;
  startHere: boolean;
  busy: boolean;
  disabled: boolean;
  onConnect: () => void;
}) {
  const names = s.accounts.map((a) => a.name).join(", ");
  const cta =
    s.status === "connected"
      ? "Conectar outra"
      : s.status === "problem"
        ? "Reconectar"
        : "Conectar";
  const detail =
    s.status === "connected"
      ? names
      : s.status === "problem"
        ? `Caiu na Zernio: ${names}. Reconecte para voltar a receber.`
        : s.option.hint;
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--via-navy-02)]",
        startHere && "bg-[var(--via-navy-02)]",
      )}
    >
      <BrandTile id={iconOf(s)} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium text-foreground">
          {s.option.label}
          {s.status === "connected" && <Badge>conectado</Badge>}
          {s.status === "problem" && <Badge variant="destructive">desconectado</Badge>}
          {startHere && (
            <Badge className="bg-[var(--via-navy)] text-white hover:bg-[var(--via-navy)]">
              comece por aqui
            </Badge>
          )}
        </p>
        <p className="truncate text-[13px] text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>
      <Button
        size="sm"
        variant={s.status === "connected" ? "ghost" : "outline"}
        onClick={onConnect}
        disabled={disabled}
        aria-label={`${cta}: ${s.option.label}`}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ExternalLink aria-hidden />}
        {cta}
      </Button>
    </li>
  );
}
