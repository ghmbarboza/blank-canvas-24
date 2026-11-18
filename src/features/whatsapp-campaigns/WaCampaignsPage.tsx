import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MessageCircle, Plus } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { enabledModules } from "@/components/layout/modules";
import { useChannels } from "@/features/inbox/api";
import { useAccount } from "@/lib/account";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useCampaignAction, useCampaignCounts, useWaCampaigns, type WaCampaign } from "./api";
import { NewWaCampaignDialog } from "./NewWaCampaignDialog";

const STATUS: Record<WaCampaign["status"], string> = {
  draft: "rascunho",
  scheduled: "agendada",
  sending: "disparando",
  done: "concluída",
  canceled: "cancelada",
};

// Campanhas de WhatsApp (#67): modelo aprovado para quem aceitou receber, no ritmo do número.
export function WaCampaignsPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const campaigns = useWaCampaigns(accountId);
  const channels = useChannels(accountId);
  const [open, setOpen] = useState(false);
  const whatsapp = (channels.data ?? []).filter(
    (c) => c.platform === "whatsapp" && c.status === "connected",
  );
  const list = campaigns.data ?? [];
  const emailOn = enabledModules(current?.settings).has("campanhas");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Campanhas de WhatsApp"
        description="Um modelo aprovado para quem aceitou receber, no ritmo do número, e quem recebeu."
        actions={
          <>
            {emailOn && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/campanhas">Campanhas de e-mail</Link>
              </Button>
            )}
            {isManager && whatsapp.length > 0 && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus /> Nova campanha
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-3 px-4 pb-10 lg:px-8">
        {campaigns.isLoading || channels.isLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : campaigns.isError ? (
          <p className="text-[13px] text-danger">{errorMessage(campaigns.error)}</p>
        ) : whatsapp.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Conecte um WhatsApp para fazer campanhas"
            description="Campanha usa modelo de mensagem aprovado, então precisa do WhatsApp Oficial pela Zernio."
            action={
              <Button asChild>
                <Link to="/canais" hash="whatsapp-oficial">
                  Conectar o WhatsApp Oficial
                </Link>
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Nenhuma campanha ainda"
            description="Escolha um modelo aprovado e o público por etiqueta. Só recebe quem deu consentimento e não pediu para sair."
            action={
              isManager ? (
                <Button onClick={() => setOpen(true)}>
                  <Plus /> Criar a primeira
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-3">
            {list.map((c) => (
              <CampaignItem
                key={c.id}
                accountId={accountId}
                campaign={c}
                channelName={whatsapp.find((w) => w.id === c.channel_id)?.name ?? "WhatsApp"}
                canManage={isManager}
              />
            ))}
          </ul>
        )}
      </div>
      {whatsapp.length > 0 && (
        <NewWaCampaignDialog
          accountId={accountId}
          channels={whatsapp}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </div>
  );
}

function CampaignItem({
  accountId,
  campaign: c,
  channelName,
  canManage,
}: {
  accountId: string;
  campaign: WaCampaign;
  channelName: string;
  canManage: boolean;
}) {
  const counts = useCampaignCounts(accountId, c.id, c.status === "sending");
  const action = useCampaignAction(accountId);
  const [confirming, setConfirming] = useState(false);
  // vazio = dispara agora; com data = agenda
  const [when, setWhen] = useState("");
  const n = counts.data;
  return (
    <li className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-medium">
            {c.name}
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[13px] font-normal text-foreground">
              {STATUS[c.status]}
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <ChannelIcon platform="whatsapp" size={14} /> {channelName} · modelo {c.template_name}
            {c.audience_tags.length ? ` · etiquetas: ${c.audience_tags.join(", ")}` : " · todos"}
            {c.launched_at
              ? ` · disparada em ${format(new Date(c.launched_at), "dd/MM HH:mm", { locale: ptBR })}`
              : c.status === "scheduled" && c.scheduled_at
                ? ` · sai em ${format(new Date(c.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}`
                : ""}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {c.status === "draft" &&
              (confirming ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Voltar
                  </Button>
                  <Label htmlFor={`when-${c.id}`} className="sr-only">
                    Agendar para
                  </Label>
                  <Input
                    id={`when-${c.id}`}
                    type="datetime-local"
                    className="h-8 w-48"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={action.isPending}
                    onClick={() =>
                      when
                        ? action.mutate(
                            { id: c.id, action: "schedule", at: new Date(when).toISOString() },
                            { onSuccess: () => setConfirming(false) },
                          )
                        : action.mutate({ id: c.id, action: "launch" })
                    }
                  >
                    {action.isPending && <Loader2 className="animate-spin" aria-hidden />}
                    {when ? "Agendar" : "Disparar agora"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={action.isPending}
                    onClick={() => action.mutate({ id: c.id, action: "delete" })}
                  >
                    Apagar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                    Disparar
                  </Button>
                </>
              ))}
            {c.status === "scheduled" && (
              <Button
                variant="outline"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate({ id: c.id, action: "cancel" })}
              >
                Desagendar
              </Button>
            )}
            {c.status === "sending" && (
              <Button
                variant="outline"
                size="sm"
                disabled={action.isPending}
                onClick={() => action.mutate({ id: c.id, action: "cancel" })}
              >
                Cancelar envio
              </Button>
            )}
          </div>
        )}
      </div>
      {confirming && (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-[13px]">
          O envio é cobrado pela Meta por conversa de marketing e não dá para desfazer o que já
          saiu. Vai em lotes de 30 por minuto; horário silencioso adia para a manhã. Escolha dia e
          hora para agendar, ou deixe vazio para disparar agora. Agendada, o público é montado na
          hora do envio.
        </p>
      )}
      {c.status !== "draft" && n && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Enviadas", n.sent],
              ["Na fila", n.queued],
              ["Puladas", n.skipped],
              ["Com erro", n.failed],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="font-display text-[20px] font-medium tabular-nums">
                {formatNumber(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
