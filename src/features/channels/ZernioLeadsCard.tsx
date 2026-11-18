import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { BrandTile } from "@/components/brand/BrandIcon";
import { SocialNetworks } from "./SocialNetworks";
import { useZernioLeadsStatus } from "./zernio-leads-status";

// Caminho recomendado: o lead do Facebook e do Instagram chega pela Zernio (evento lead.received),
// sem app da Meta, token de página nem webhook para configurar.
export function ZernioLeadsCard({
  accountId,
  withConnect = true,
}: {
  accountId: string;
  /** Em Canais os botões das redes já estão logo acima: o cartão só explica o passo a passo. */
  withConnect?: boolean;
}) {
  const status = useZernioLeadsStatus(accountId);
  return (
    <section
      aria-labelledby="zernio-leads"
      className="rounded-[var(--via-radius-lg)] border border-[var(--via-border-soft)] bg-surface px-5 py-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <BrandTile id="zernio" size={28} />
        <h3 id="zernio-leads" className="text-[14px] font-medium">
          Leads dos anúncios da Meta, pela Zernio
        </h3>
        <Badge variant="secondary">recomendado</Badge>
        {status.done ? <Badge>conectado</Badge> : null}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        A mesma conta da Zernio do WhatsApp traz os leads dos formulários de anúncio. Sem app da
        Meta, sem token e sem webhook: cada lead cai no formulário “Leads de anúncios”, que a
        central cria sozinha.
      </p>
      <ol className="mt-3 grid gap-1.5 text-[13px] leading-relaxed">
        <li>
          1. No painel da Zernio, ative <strong>Ads</strong> (o recurso de anúncios da conta).
        </li>
        <li>
          2. Conecte a página do Facebook{" "}
          {withConnect ? "abaixo" : "em Tudo pela Zernio, acima (Meta Ads)"} e aceite a permissão de
          leads.
        </li>
        <li>
          3. Uma vez por página, aceite os termos de anúncios de cadastro da Meta.{" "}
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-[13px]">
            <a
              href="https://www.facebook.com/ads/leadgen/tos/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir os termos <ExternalLink className="size-3" aria-hidden />
            </a>
          </Button>
        </li>
      </ol>
      {withConnect && (
        <div className="mt-4">
          <SocialNetworks
            accountId={accountId}
            only={["facebook", "instagram"]}
            returnPath="/painel"
            compact
          />
        </div>
      )}
    </section>
  );
}
