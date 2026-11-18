import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { BrandIcon, BrandTile } from "@/components/brand/BrandIcon";
import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { isConnected, useIntegrations, type CreateEvolutionResult } from "./api";
import { OPEN_OFFICIAL_EVENT } from "./constants";
import { EvolutionConnect } from "./EvolutionConnect";
import { ZernioKeyForm } from "./IntegrationForms";
import { MetaConnectDialog } from "./MetaConnectDialog";
import { ZadarmaSmsDialog } from "./ZadarmaSmsDialog";
import { useConnectWhatsApp } from "./zernio-api";
import { hasChannel } from "@/lib/edition";

const PROS = [
  "Número oficial da Meta, sem risco de bloqueio por QR",
  "Vários atendentes no mesmo número, sem o celular ligado",
  "Modelos aprovados para falar com o cliente depois das 24 h",
];

export function Step({
  n,
  title,
  note,
  done,
  last,
  children,
}: {
  n: number;
  title: string;
  note: string;
  done: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-border" aria-hidden />}
      <span
        className={cn(
          "relative grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
          done ? "bg-primary-soft text-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        {done ? <Check className="size-3.5" aria-label="Pronto" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{note}</p>
        <div className="mt-3">{children}</div>
      </div>
    </li>
  );
}

// WhatsApp Oficial da Meta (pela Zernio): caminho secundário, em dois passos (chave e Meta).
export function WhatsAppHero({
  accountId,
  compact = false,
}: {
  accountId: string;
  /** dentro de modal (assistente de configuração): uma coluna, sem tipografia de vitrine */
  compact?: boolean;
}) {
  const integrations = useIntegrations(accountId, true);
  const connect = useConnectWhatsApp(accountId);
  const [coexistence, setCoexistence] = useState(true);
  const ready = isConnected(integrations.data, "zernio");

  function start() {
    connect.mutate(coexistence, {
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <article
      aria-labelledby="wa-hero"
      className={cn(
        "atmosphere grid grid-cols-1 gap-8 rounded-[28px] border border-foreground/80 bg-surface p-5",
        !compact && "sm:p-8 lg:grid-cols-[1fr_minmax(0,24rem)] lg:p-10",
      )}
    >
      <div className="flex flex-col justify-center">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          número oficial da Meta
        </span>
        <h2
          id="wa-hero"
          className={cn(
            "mt-4 flex items-center gap-3 font-display text-[28px] leading-tight font-semibold",
            !compact && "sm:text-[36px]",
          )}
        >
          <ChannelIcon platform="whatsapp" size={30} /> WhatsApp Oficial
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Para quem prefere o número oficial da Meta: funciona sem o celular ligado e aceita vários
          atendentes no mesmo número. Precisa de uma conta na Zernio.
        </p>
        <ul className="mt-6 space-y-3 text-[14px]">
          {PROS.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft">
                <Check className="size-3 text-foreground" aria-hidden />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-border bg-surface-2 p-5 sm:p-6">
        <h3 className="eyebrow">Como conectar agora</h3>
        {integrations.isLoading ? (
          <Loader2
            className="mt-5 size-4 animate-spin text-muted-foreground"
            aria-label="Carregando"
          />
        ) : (
          <ol className="mt-5">
            <Step
              n={1}
              title="Salve a chave da Zernio"
              note="A Zernio faz a ponte oficial com a Meta. Crie a conta em zernio.com e cole a chave aqui."
              done={ready}
            >
              {ready ? (
                <p className="text-[12px] font-medium text-foreground">Chave salva e testada.</p>
              ) : (
                <ZernioKeyForm accountId={accountId} state={integrations.data} />
              )}
            </Step>
            <Step
              n={2}
              title="Conecte com o Facebook"
              note="Abre a página segura da Meta para você confirmar o número da empresa."
              done={false}
              last
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <Label htmlFor="coex" className="flex cursor-pointer items-start gap-2.5">
                    <Smartphone
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>
                      <span className="block text-[13px] font-medium">
                        Manter o número no celular
                      </span>
                      <span className="block text-[12px] font-normal text-muted-foreground">
                        {coexistence
                          ? "Continua no app WhatsApp Business. A Meta mostra um QR para ler nele."
                          : "O número sai do app e funciona só aqui, com ligação pelo WhatsApp."}
                      </span>
                    </span>
                  </Label>
                  <Switch
                    id="coex"
                    checked={coexistence}
                    onCheckedChange={setCoexistence}
                    disabled={!ready}
                  />
                </div>
                <Button
                  onClick={start}
                  disabled={!ready || connect.isPending}
                  className="h-11 w-full"
                >
                  {connect.isPending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <span className="grid size-5 place-items-center rounded-full bg-white">
                      <BrandIcon id="facebook" size={16} />
                    </span>
                  )}
                  Conectar com o Facebook
                </Button>
                {!ready && (
                  <p className="text-[11px] text-subtle">Libera depois de salvar a chave.</p>
                )}
              </div>
            </Step>
          </ol>
        )}
      </div>
    </article>
  );
}

function LegacyOption({
  title,
  note,
  cta,
  brand,
  onClick,
}: {
  title: string;
  note: string;
  cta: string;
  /** Logo oficial da ferramenta (Meta, WhatsApp, Zadarma). */
  brand: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
      <BrandTile id={brand} size={32} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="text-[12px] text-muted-foreground">{note}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>
        {cta}
      </Button>
    </div>
  );
}

// WhatsApp por QR Code: o caminho principal. Endereço e chave do servidor, QR Code na mesma tela
// e "Conectado" sozinho quando o celular lê.
export function WhatsAppQrCard({
  accountId,
  onConnected,
}: {
  accountId: string;
  onConnected?: () => void;
}) {
  return (
    <article
      aria-labelledby="wa-qr"
      className="rounded-[28px] border border-foreground/80 bg-surface p-5 sm:p-8"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
            <QrCode className="size-3" aria-hidden /> o jeito mais rápido
          </span>
          <h2
            id="wa-qr"
            className="mt-4 flex items-center gap-3 font-display text-[26px] leading-tight font-semibold sm:text-[30px]"
          >
            <ChannelIcon platform="whatsapp" size={28} /> WhatsApp por QR Code
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Conecte o número que a empresa já usa: cole o endereço e a chave do servidor, leia o
            código com o celular e pronto.
          </p>
          <p className="mt-3 text-[12px] text-subtle">
            Use para conversar com quem já é cliente. Disparo em massa para desconhecidos pode fazer
            o WhatsApp bloquear o número.
          </p>
        </div>
        <EvolutionConnect accountId={accountId} {...(onConnected ? { onConnected } : {})} />
      </div>
    </article>
  );
}

// "Quero usar o número oficial da Meta": o caminho pela Zernio continua aqui, fechado por padrão.
export function OfficialWhatsApp({
  accountId,
  compact = false,
  defaultOpen = false,
}: {
  accountId: string;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // links de outras partes da página (chave da Zernio, campanhas) abrem o bloco
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_OFFICIAL_EVENT, show);
    return () => window.removeEventListener(OPEN_OFFICIAL_EVENT, show);
  }, []);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex min-h-9 items-center gap-1.5 rounded-md text-[13px] font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Quero usar o número oficial da Meta
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <WhatsAppHero accountId={accountId} compact={compact} />
      </CollapsibleContent>
    </Collapsible>
  );
}

// Outras formas de conectar (app próprio na Meta e SMS), fechadas por padrão: casos especiais.
export function LegacyWhatsApp({ accountId }: { accountId: string }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex min-h-9 items-center gap-1 rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Outras formas de conectar (avançado)
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 grid gap-2">
        <LegacyOption
          title="WhatsApp com o app próprio na Meta"
          note="Para quem já tem um app criado na Meta e quer usar o dele."
          cta="Conectar pela Meta"
          brand="meta"
          onClick={() => setMetaOpen(true)}
        />
        <LegacyOption
          title="SMS pela Zadarma"
          note="Com o número virtual da Zadarma. Os SMS entram na Caixa de entrada."
          cta="Conectar SMS"
          brand="zadarma"
          onClick={() => setSmsOpen(true)}
        />
      </CollapsibleContent>
      <MetaConnectDialog accountId={accountId} open={metaOpen} onOpenChange={setMetaOpen} />
      <ZadarmaSmsDialog accountId={accountId} open={smsOpen} onOpenChange={setSmsOpen} />
    </Collapsible>
  );
}

// Bloco completo para telas estreitas: QR Code na frente, número oficial como segunda opção.
export function AddWhatsApp({
  accountId,
  onConnected,
}: {
  accountId: string;
  /** legado: a conexão por QR agora acontece dentro do próprio bloco */
  onEvolutionCreated?: (result: CreateEvolutionResult) => void;
  onConnected?: () => void;
}) {
  return (
    <div className="space-y-4">
      <EvolutionConnect accountId={accountId} {...(onConnected ? { onConnected } : {})} />
      {hasChannel("whatsapp_official") && <OfficialWhatsApp accountId={accountId} compact />}
    </div>
  );
}
