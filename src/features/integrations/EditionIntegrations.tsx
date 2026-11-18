import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { BrandTile } from "@/components/brand/BrandIcon";
import { Button } from "@/components/ui/button";
import { isConnected, useIntegrations } from "@/features/channels/api";
import { SettingsCard } from "@/features/settings/SettingsCard";
import { useAccount } from "@/lib/account";
import { hasProvider } from "@/lib/edition";
import { cn } from "@/lib/utils";

// Integrações da edição enxuta: só o que os canais do produto precisam (servidor do WhatsApp por
// QR Code e, com Instagram, a chave da Zernio). A configuração de cada uma mora em Canais.
const ROWS = [
  {
    id: "evolution",
    brand: "whatsapp",
    name: "WhatsApp por QR Code",
    what: "Endereço e chave do servidor que conecta o número da empresa.",
    hash: "whatsapp-qr",
  },
  {
    id: "zernio",
    brand: "zernio",
    name: "Zernio (Instagram)",
    what: "Chave do serviço que traz as mensagens diretas do Instagram para a Caixa de entrada.",
    hash: "instagram",
  },
] as const;

export function EditionIntegrations() {
  const { current, isAdmin } = useAccount();
  const integrations = useIntegrations(current!.accountId, true);
  const rows = ROWS.filter((r) => hasProvider(r.id));
  return (
    <SettingsCard
      title="Integrações"
      description="O que liga os seus canais de atendimento. A IA já vem inclusa: não precisa de chave. As chaves ficam no cofre, nunca à vista."
      readOnlyNote={isAdmin ? undefined : "Só administradores conectam integrações."}
    >
      {integrations.isLoading ? (
        <Loader2 className="mx-auto my-8 animate-spin text-subtle" aria-label="Carregando" />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => {
            const ok = isConnected(integrations.data, r.id);
            const error = integrations.data?.byProvider[r.id]?.status === "error";
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-4">
                <BrandTile id={r.brand} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                    {r.name}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        ok
                          ? "bg-primary-soft text-foreground"
                          : error
                            ? "bg-danger/10 text-danger"
                            : "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {ok ? "Conectado" : error ? "Com problema" : "Ainda não ligado"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{r.what}</p>
                </div>
                {isAdmin && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/canais" hash={r.hash}>
                      {ok ? "Ver em Canais" : "Configurar em Canais"}
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}
