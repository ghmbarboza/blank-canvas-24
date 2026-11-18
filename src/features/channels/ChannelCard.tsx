import { hasChannel } from "@/lib/edition";
import {
  Activity,
  Loader2,
  LogOut,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  QrCode,
  RefreshCw,
  Trash2,
  UserRound,
  Users,
  Webhook,
} from "lucide-react";

import { BrandIcon } from "@/components/brand/BrandIcon";
import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Channel } from "./api";
import { channelBrand, providerLabel } from "./constants";
import { channelHealth, type HealthTone } from "./health";

export type ChannelIntent =
  "rename" | "assign" | "qr" | "status" | "sync" | "webhook" | "logout" | "remove" | "calling";

interface Props {
  channel: Channel;
  ownerName: string | null;
  canManage: boolean;
  busy: boolean;
  onIntent: (intent: ChannelIntent, channel: Channel) => void;
  /** Liga/desliga a IA neste canal (os agentes de IA só respondem com ela ligada). */
  onToggleAi?: (on: boolean) => void;
}

export function ChannelCard({ channel, ownerName, canManage, busy, onIntent, onToggleAi }: Props) {
  const isEvolution = channel.provider === "evolution";
  const isZernioWhatsApp = channel.provider === "zernio" && channel.platform === "whatsapp";
  const act = (intent: ChannelIntent) => () => onIntent(intent, channel);

  const health = channelHealth(channel);
  const brand = channelBrand(channel);

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-2xl border bg-surface p-4 transition-colors",
        health.tone === "problem" ? "border-danger/40" : "border-border hover:border-border-strong",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface">
          {brand ? (
            <BrandIcon id={brand} size={20} />
          ) : (
            <ChannelIcon platform={channel.platform} size={20} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-medium text-foreground">{channel.name}</h3>
          <p className="truncate text-[12px] text-muted-foreground">
            {channel.handle ?? providerLabel(channel.provider, channel.platform)}
          </p>
        </div>
        <div className="order-last basis-full pl-14 sm:order-none sm:basis-auto sm:pl-0 sm:text-right">
          <p className="hidden text-[11px] text-subtle sm:block">saúde da conexão</p>
          <p
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px] font-medium",
              TONE_TEXT[health.tone],
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                TONE_DOT[health.tone],
                health.tone === "pending" && "animate-pulse",
              )}
              aria-hidden
            />
            {health.label}
          </p>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-1 size-8 shrink-0"
                aria-label={`Ações de ${channel.name}`}
              >
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <MoreHorizontal aria-hidden />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={act("rename")}>
                <Pencil aria-hidden /> Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={act("assign")}>
                <UserRound aria-hidden /> Vendedor e compartilhamento
              </DropdownMenuItem>
              {isZernioWhatsApp && hasChannel("phone") && (
                <DropdownMenuItem onSelect={act("calling")}>
                  <PhoneCall aria-hidden /> Ligação pelo WhatsApp
                </DropdownMenuItem>
              )}
              {isEvolution && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={act("qr")}>
                    <QrCode aria-hidden /> Ver QR de novo
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={act("status")}>
                    <Activity aria-hidden /> Verificar status
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={act("sync")}>
                    <RefreshCw aria-hidden /> Sincronizar grupos
                  </DropdownMenuItem>
                </>
              )}
              {channel.provider !== "zernio" && (
                <DropdownMenuItem onSelect={act("webhook")}>
                  <Webhook aria-hidden /> Endereço de recebimento (webhook)
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {isEvolution && (
                <DropdownMenuItem onSelect={act("logout")}>
                  <LogOut aria-hidden /> Desconectar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={act("remove")} className="text-danger focus:text-danger">
                <Trash2 aria-hidden /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {health.fix && (
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-[12px]",
            health.tone === "problem"
              ? "bg-danger/8 text-danger"
              : "bg-surface-2 text-muted-foreground",
          )}
        >
          {health.tone === "problem" && channel.status_detail && (
            <p className="line-clamp-2 font-medium">{channel.status_detail}</p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {health.fix}
            {canManage && health.action && (
              <button
                type="button"
                onClick={act(health.action)}
                className="font-semibold underline underline-offset-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {health.action === "qr" ? "Ler QR de novo" : "Ver endereço de recebimento"}
              </button>
            )}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
        <div className="min-w-0">
          <Label htmlFor={`ai-${channel.id}`} className="text-[13px] font-medium">
            Agentes de IA respondem
          </Label>
          <p className="text-[12px] text-muted-foreground">
            {channel.ai_enabled
              ? "O agente deste canal atende. Desligado, tudo vai para a equipe."
              : "Desligado: as mensagens deste canal vão direto para a equipe."}
          </p>
        </div>
        <Switch
          id={`ai-${channel.id}`}
          checked={channel.ai_enabled}
          disabled={!canManage || !onToggleAi}
          onCheckedChange={(on) => onToggleAi?.(on)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        <span className="inline-flex items-center gap-1">
          {channel.is_shared ? (
            <Users className="size-3" aria-hidden />
          ) : (
            <UserRound className="size-3" aria-hidden />
          )}
          {ownerName
            ? `${ownerName}${channel.is_shared ? " · compartilhado" : " · só ele"}`
            : "Equipe"}
        </span>
        <span>{providerLabel(channel.provider, channel.platform)}</span>
        <span className="tabular-nums sm:ml-auto" title="Última atividade">
          {channel.last_event_at ? formatRelative(channel.last_event_at) : "sem atividade"}
        </span>
      </div>
    </article>
  );
}

const TONE_TEXT: Record<HealthTone, string> = {
  live: "text-foreground",
  pending: "text-muted-foreground",
  off: "text-muted-foreground",
  problem: "text-danger",
};

const TONE_DOT: Record<HealthTone, string> = {
  live: "bg-success",
  pending: "bg-primary",
  off: "bg-subtle",
  problem: "bg-danger",
};
