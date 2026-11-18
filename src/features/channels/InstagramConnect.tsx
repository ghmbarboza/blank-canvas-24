import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BrandIcon } from "@/components/brand/BrandIcon";
import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/functions";
import { Step } from "./AddWhatsApp";
import { channelAction, isConnected, useChannels, useIntegrations } from "./api";
import { ZernioKeyForm } from "./IntegrationForms";

// Instagram: o segundo canal do produto. A conexão passa pela Zernio, então o cartão pede a chave
// dela aqui mesmo (passo 1) e depois abre a autorização do Instagram (passo 2).
export function InstagramCard({ accountId }: { accountId: string }) {
  const integrations = useIntegrations(accountId, true);
  const channels = useChannels(accountId);
  const [opening, setOpening] = useState(false);
  const ready = isConnected(integrations.data, "zernio");
  const connected = (channels.data ?? []).some(
    (c) => c.provider === "zernio" && c.platform === "instagram" && c.status === "connected",
  );

  async function connect() {
    setOpening(true);
    try {
      const { url } = await channelAction<{ url: string }>(accountId, "zernio.connect_url", {
        platform: "instagram",
        redirectUrl: `${window.location.origin}/canais?conectado=1`,
      });
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
      setOpening(false);
    }
  }

  return (
    <article
      aria-labelledby="ig-card"
      className="rounded-[28px] border border-border bg-surface p-5 sm:p-8"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            opcional
          </span>
          <h2
            id="ig-card"
            className="mt-4 flex items-center gap-3 font-display text-[26px] leading-tight font-semibold sm:text-[30px]"
          >
            <ChannelIcon platform="instagram" size={28} /> Instagram
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            As mensagens diretas do Instagram da empresa chegam na mesma Caixa de entrada do
            WhatsApp, e a equipe responde por aqui.
          </p>
          <p className="mt-3 text-[12px] text-subtle">
            Precisa ser uma conta profissional do Instagram. Depois de 24 horas da última mensagem
            do cliente, o Instagram só deixa responder como atendimento humano.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-2 p-5 sm:p-6">
          <h3 className="eyebrow">Como conectar</h3>
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
                note="A Zernio é o serviço que liga o Instagram a esta central. Crie a conta em zernio.com, copie a chave e cole aqui. Faz uma vez só."
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
                title="Autorize o Instagram"
                note="Abre a página do Instagram para você entrar na conta da empresa e autorizar. Depois você volta para cá sozinho."
                done={connected}
                last
              >
                <Button
                  onClick={() => void connect()}
                  disabled={!ready || opening}
                  variant={connected ? "outline" : "default"}
                  className="h-11 w-full"
                >
                  {opening ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <BrandIcon id="instagram" size={16} />
                  )}
                  {connected ? "Conectar outra conta do Instagram" : "Conectar o Instagram"}
                </Button>
                {!ready && (
                  <p className="mt-2 text-[11px] text-subtle">Libera depois de salvar a chave.</p>
                )}
              </Step>
            </ol>
          )}
        </div>
      </div>
    </article>
  );
}
