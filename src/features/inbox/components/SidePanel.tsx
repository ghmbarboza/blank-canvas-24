import { Link } from "@tanstack/react-router";
import { ArrowUpRight, UserRoundX, Users } from "lucide-react";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { ContactAvatar } from "@/components/common/ContactAvatar";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMessages } from "../api";
import { channelHandle, platformLabel } from "../lib/channel";
import { countParticipants } from "../lib/thread";
import type { Channel, Contact, Conversation } from "../types";
import { ContactCard } from "./ContactCard";
import { ConversationTags } from "./ConversationTags";
import { OpportunityBlock } from "@/features/opportunity/OpportunityBlock";
import { CallButton } from "@/features/telephony/softphone/CallButton";
import { EventsBlock } from "./EventsBlock";
import { IntelligenceBlock } from "./IntelligenceBlock";
import { RecentHistory } from "./RecentHistory";
import { NextStepBlock } from "./NextStepBlock";
import { PanelSection } from "./PanelSection";

interface Props {
  accountId: string;
  conversation: Conversation;
  channel: Channel | undefined;
  contact: Contact | null;
  contactLoading: boolean;
}

export function SidePanel({ accountId, conversation, channel, contact, contactLoading }: Props) {
  if (conversation.is_group) {
    return <GroupPanel accountId={accountId} conversation={conversation} channel={channel} />;
  }
  if (contactLoading) {
    return (
      <div className="flex flex-col items-center gap-3 p-6" aria-busy="true">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (!contact) {
    return (
      <EmptyState
        icon={UserRoundX}
        title="Sem contato vinculado"
        description="Esta conversa ainda não está ligada a um cliente."
      />
    );
  }
  return (
    // pb-24: o rodapé do painel fica acima do botão flutuante do telefone
    <div className="pb-24">
      <ContactCard accountId={accountId} contact={contact} />
      {contact.phone && (
        <div className="px-5 pb-3">
          <CallButton contactId={contact.id} phone={contact.phone} name={contact.name} size="sm" />
        </div>
      )}
      <PanelSection title="Etiquetas da conversa">
        <ConversationTags accountId={accountId} conversation={conversation} />
      </PanelSection>
      <PanelSection title="Saúde do cliente">
        <IntelligenceBlock accountId={accountId} contact={contact} />
      </PanelSection>
      <div className="px-5 pb-5">
        <NextStepBlock accountId={accountId} contact={contact} />
      </div>
      <RecentHistory accountId={accountId} contactId={contact.id} />
      <PanelSection title="Jornada do cliente">
        <OpportunityBlock accountId={accountId} contact={contact} />
      </PanelSection>
      <EventsBlock accountId={accountId} contactId={contact.id} />
      <div className="px-5 pt-2">
        <Link
          to="/contatos/$contactId"
          params={{ contactId: contact.id }}
          className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver ficha completa <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function GroupPanel({
  accountId,
  conversation,
  channel,
}: {
  accountId: string;
  conversation: Conversation;
  channel: Channel | undefined;
}) {
  const messages = useMessages(accountId, conversation.id);
  const participants = countParticipants(messages.data ?? []);
  const title = conversation.title || "Grupo sem nome";
  const handle = channelHandle(channel);
  return (
    <div className="pb-6">
      <div className="flex flex-col items-center px-5 pt-8 pb-6 text-center">
        <ContactAvatar
          name={title}
          src={conversation.avatar_url}
          platform={channel?.platform ?? null}
          isGroup
          size={80}
        />
        <h2 className="mt-4 font-display text-xl font-medium">{title}</h2>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Users className="size-3.5" aria-hidden /> Conversa em grupo
        </p>
      </div>
      <PanelSection title="Canal">
        {channel ? (
          <div className="flex items-center gap-2.5 text-[13px]">
            <ChannelIcon platform={channel.platform} size={18} />
            <div className="min-w-0">
              <p className="font-medium">
                {platformLabel(channel.platform)} · {channel.name}
              </p>
              {handle && <p className="text-subtle tabular-nums">{handle}</p>}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Canal indisponível</p>
        )}
      </PanelSection>
      {participants > 0 && (
        <PanelSection title="Participantes">
          <p className="font-display text-3xl font-semibold tabular-nums">{participants}</p>
          <p className="mt-1 text-[12px] text-subtle">Pessoas que falaram nas mensagens recentes</p>
        </PanelSection>
      )}
    </div>
  );
}
