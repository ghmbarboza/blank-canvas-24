import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Bot,
  Check,
  Clock,
  LifeBuoy,
  MoreHorizontal,
  PanelRight,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { PLATFORM_LABEL } from "@/components/brand/platform-label";
import { ContactAvatar } from "@/components/common/ContactAvatar";
import { OriginChip } from "@/components/common/OriginChip";
import type { TouchLike } from "@/features/contacts/origin";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useContact, useUpdateConversation } from "../api";
import { channelHandle } from "../lib/channel";
import { SNOOZE_OPTIONS } from "../lib/snooze";
import type { Channel, Conversation, Member } from "../types";
import { AssigneeSelect } from "./AssigneeSelect";
import { TransferToQueueDialog } from "./TransferToQueueDialog";
import { NewTicketDialog } from "@/features/support/NewTicketDialog";

interface Props {
  accountId: string;
  conversation: Conversation;
  channel: Channel | undefined;
  name: string;
  avatarUrl: string | null;
  members: Member[];
  onOpenPanel: () => void;
}

export function ConversationHeader(props: Props) {
  const { accountId, conversation, channel, name, avatarUrl, members, onOpenPanel } = props;
  const update = useUpdateConversation(accountId, conversation.id);
  // mesma consulta do painel lateral (cache compartilhado): de onde a pessoa veio
  const contact = useContact(accountId, conversation.is_group ? null : conversation.contact_id);
  const closed = conversation.status === "closed";
  const snoozed = conversation.status === "snoozed" && conversation.snoozed_until;
  const handle = channelHandle(channel);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  return (
    <header className="@container flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-3 py-2.5 sm:px-5">
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Voltar para conversas"
      >
        <Link to="/inbox">
          <ArrowLeft />
        </Link>
      </Button>
      <ContactAvatar
        name={name}
        src={avatarUrl}
        platform={channel?.platform ?? null}
        isGroup={conversation.is_group}
        size={40}
      />
      {/* nome nunca some: as ações encolhem para só ícone conforme a largura da coluna (#30) */}
      <div className="min-w-[8rem] flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[15px] font-medium text-foreground">{name}</h2>
          <OriginChip
            touch={contact.data?.first_touch as TouchLike | null | undefined}
            className="hidden max-w-[16rem] @[520px]:inline-flex"
          />
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {channel ? (
            <>
              <ChannelIcon platform={channel.platform} size={13} />
              <span className="truncate">
                {PLATFORM_LABEL[channel.platform] ?? channel.platform} · {channel.name}
              </span>
              {handle && (
                <span className="hidden truncate text-subtle tabular-nums md:inline">{handle}</span>
              )}
            </>
          ) : (
            <span>Canal indisponível</span>
          )}
          {snoozed && (
            <span className="ml-1 hidden items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] sm:inline-flex">
              <Clock className="size-3" aria-hidden />
              até{" "}
              {format(new Date(conversation.snoozed_until ?? ""), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {conversation.ai_handoff_at && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                aria-label="Devolver à IA"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    patch: { ai_handoff_at: null, ai_handoff_reason: null },
                    success: "A IA volta a responder esta conversa",
                  })
                }
              >
                <Bot /> <span className="hidden @[620px]:inline">Devolver à IA</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {conversation.ai_handoff_reason ?? "A IA passou esta conversa para a equipe"}
            </TooltipContent>
          </Tooltip>
        )}
        <span className="hidden items-center gap-1.5 @[640px]:flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Abrir chamado"
                onClick={() => setTicketOpen(true)}
              >
                <LifeBuoy />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir chamado</TooltipContent>
          </Tooltip>
        </span>
        <AssigneeSelect
          members={members}
          value={conversation.assignee_user_id}
          disabled={update.isPending}
          onChange={(userId, label) =>
            update.mutate({
              patch: { assignee_user_id: userId },
              success: userId ? `Atribuída a ${label}` : "Conversa sem responsável",
            })
          }
        />
        <span className="hidden items-center gap-1.5 @[640px]:flex">
          {!closed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Transferir para uma fila"
                  onClick={() => setTransferOpen(true)}
                >
                  <ArrowRightLeft />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Transferir para uma fila</TooltipContent>
            </Tooltip>
          )}
          {!closed && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Adiar conversa"
                      disabled={update.isPending}
                    >
                      <Clock />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Adiar</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[11px] tracking-widest text-subtle uppercase">
                  Adiar até
                </DropdownMenuLabel>
                {SNOOZE_OPTIONS.map((o) => (
                  <DropdownMenuItem
                    key={o.id}
                    onSelect={() =>
                      update.mutate({
                        patch: { status: "snoozed", snoozed_until: o.at().toISOString() },
                        success: "Conversa adiada",
                      })
                    }
                  >
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
        {/* coluna estreita (painel do contato aberto): as ações secundárias vão para "Mais" */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Mais ações"
              className="@[640px]:hidden"
              disabled={update.isPending}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setTicketOpen(true)}>
              <LifeBuoy /> Abrir chamado
            </DropdownMenuItem>
            {!closed && (
              <>
                <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
                  <ArrowRightLeft /> Transferir para uma fila
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Clock /> Adiar
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {SNOOZE_OPTIONS.map((o) => (
                      <DropdownMenuItem
                        key={o.id}
                        onSelect={() =>
                          update.mutate({
                            patch: { status: "snoozed", snoozed_until: o.at().toISOString() },
                            success: "Conversa adiada",
                          })
                        }
                      >
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant={closed ? "outline" : "default"}
          size="sm"
          aria-label={closed ? "Reabrir" : "Resolver"}
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              closed
                ? { patch: { status: "open", snoozed_until: null }, success: "Conversa reaberta" }
                : {
                    patch: { status: "closed", snoozed_until: null },
                    success: "Conversa resolvida",
                  },
            )
          }
        >
          {closed ? <RotateCcw /> : <Check />}
          <span className="hidden @[480px]:inline">{closed ? "Reabrir" : "Resolver"}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden"
          aria-label="Abrir detalhes do contato"
          onClick={onOpenPanel}
        >
          <PanelRight />
        </Button>
      </div>
      <TransferToQueueDialog
        accountId={accountId}
        conversationId={conversation.id}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
      <NewTicketDialog
        accountId={accountId}
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        defaults={{
          subject: (conversation.last_message_preview ?? "").slice(0, 120),
          contact: conversation.contact_id
            ? { id: conversation.contact_id, name, source: channel?.platform ?? null, avatarUrl }
            : null,
          conversationId: conversation.id,
          source: channel?.platform === "whatsapp" ? "whatsapp" : "conversation",
        }}
      />
    </header>
  );
}
