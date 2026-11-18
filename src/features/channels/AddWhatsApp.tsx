import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Loader2, Smartphone, Star } from "lucide-react";
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
import { EvolutionCreateDialog } from "./EvolutionCreateDialog";
import { ZernioKeyForm } from "./IntegrationForms";
import { MetaConnectDialog } from "./MetaConnectDialog";
import { ZadarmaSmsDialog } from "./ZadarmaSmsDialog";
import { useConnectWhatsApp } from "./zernio-api";

const PROS = [
  "Número oficial da Meta, sem risco de bloqueio por QR",
  "Vários atendentes no mesmo número, sem o celular ligado",
  "Modelos aprovados para falar com o cliente depois das 24 h",
];

function Step({
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

// Cartão herói do WhatsApp Oficial: o caminho recomendado, em dois passos (chave da Zernio e Meta).
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
        <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
          <Star className="size-3 fill-current" aria-hidden /> recomendado para empresas
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
          A conexão mais segura e estável. Ideal quando vários vendedores usam o mesmo número ao
          mesmo tempo, sem depender do celular ligado.
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

// Outras formas de conectar (Meta direta, QR e SMS), fechadas por padrão. O caminho principal do
// WhatsApp é o Oficial pela Zernio (decisão do dono, 04/11); estas ficam para casos especiais.
export function LegacyWhatsApp({
  accountId,
  onEvolutionCreated,
}: {
  accountId: string;
  onEvolutionCreated: (result: CreateEvolutionResult) => void;
}) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [evoOpen, setEvoOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Outras formas de conectar (avançado)
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 grid gap-2">
        <p className="text-[12px] text-subtle">
          Para casos especiais. Para o WhatsApp da empresa, use o WhatsApp Oficial acima.
        </p>
        <LegacyOption
          title="WhatsApp com o app próprio na Meta"
          note="Para quem já tem um app criado na Meta e quer usar o dele."
          cta="Conectar pela Meta"
          brand="meta"
          onClick={() => setMetaOpen(true)}
        />
        <LegacyOption
          title="WhatsApp por QR Code"
          note="Não é oficial: mensagens em massa podem bloquear o número."
          cta="Conectar por QR"
          brand="whatsapp"
          onClick={() => setEvoOpen(true)}
        />
        <LegacyOption
          title="SMS pela Zadarma"
          note="Com o número virtual da Zadarma, a mesma da telefonia. Os SMS entram na Caixa de entrada."
          cta="Conectar SMS"
          brand="zadarma"
          onClick={() => setSmsOpen(true)}
        />
        <p className="text-[12px] text-subtle">
          APIs não oficiais de WhatsApp não têm conector no Nexus.{" "}
          <Link
            to="/central-de-ajuda"
            hash="duvidas"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Já uso este número em outra ferramenta
          </Link>
        </p>
      </CollapsibleContent>
      <MetaConnectDialog accountId={accountId} open={metaOpen} onOpenChange={setMetaOpen} />
      <ZadarmaSmsDialog accountId={accountId} open={smsOpen} onOpenChange={setSmsOpen} />
      <EvolutionCreateDialog
        accountId={accountId}
        open={evoOpen}
        onOpenChange={setEvoOpen}
        onCreated={onEvolutionCreated}
      />
    </Collapsible>
  );
}

// Bloco completo (herói + outras formas), usado no assistente de configuração.
export function AddWhatsApp({
  accountId,
  onEvolutionCreated,
}: {
  accountId: string;
  onEvolutionCreated: (result: CreateEvolutionResult) => void;
}) {
  return (
    <div className="space-y-4">
      <WhatsAppHero accountId={accountId} compact />
      <LegacyWhatsApp accountId={accountId} onEvolutionCreated={onEvolutionCreated} />
    </div>
  );
}
