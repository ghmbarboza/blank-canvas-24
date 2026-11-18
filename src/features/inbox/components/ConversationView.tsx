import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageSquareOff } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import {
  useChannels,
  useContact,
  useConversation,
  useMarkConversationRead,
  useMembers,
} from "../api";
import { isAiActive } from "../lib/ai";
import type { Conversation } from "../types";
import { useConversationPresence } from "../useConversationPresence";
import { AiBanner } from "./AiBanner";
import { CollisionBanner } from "./CollisionBanner";
import { Composer } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { MessageThread } from "./MessageThread";
import { SidePanel } from "./SidePanel";

interface Props {
  accountId: string;
  conversationId: string;
}

export function ConversationView({ accountId, conversationId }: Props) {
  const conversation = useConversation(accountId, conversationId);
  const markRead = useMarkConversationRead(accountId);
  const { mutate: markAsRead } = markRead;

  useEffect(() => {
    markAsRead(conversationId);
  }, [conversationId, markAsRead]);

  if (conversation.isLoading) return <ViewSkeleton />;
  if (conversation.isError || !conversation.data) {
    return (
      <div className="flex flex-1 flex-col">
        <BackBar />
        <EmptyState
          className="flex-1"
          icon={MessageSquareOff}
          title="Conversa não encontrada"
          description={
            conversation.isError
              ? errorMessage(conversation.error)
              : "Ela pode ter sido removida ou você não tem acesso a este canal."
          }
        />
      </div>
    );
  }
  return (
    <ConversationLoaded
      accountId={accountId}
      conversation={conversation.data}
      onInbound={() => markAsRead(conversationId)}
    />
  );
}

interface LoadedProps {
  accountId: string;
  conversation: Conversation;
  onInbound: () => void;
}

function ConversationLoaded({ accountId, conversation, onInbound }: LoadedProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const channels = useChannels(accountId);
  const members = useMembers(accountId);
  const contact = useContact(accountId, conversation.contact_id);
  const { user } = useAuth();
  const memberList = members.data;
  const nameOf = useCallback(
    (id: string) => memberList?.find((m) => m.userId === id)?.name,
    [memberList],
  );
  const presence = useConversationPresence(conversation.id, user?.id ?? null, nameOf);
  const channel = channels.data?.find((c) => c.id === conversation.channel_id);
  const aiActive = isAiActive(conversation, channel);
  const name = conversation.is_group
    ? conversation.title || "Grupo sem nome"
    : contact.data?.name || conversation.title || contact.data?.phone || "Contato sem nome";

  const panel = (
    <SidePanel
      accountId={accountId}
      conversation={conversation}
      channel={channel}
      contact={contact.data ?? null}
      contactLoading={contact.isLoading}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <ConversationHeader
          accountId={accountId}
          conversation={conversation}
          channel={channel}
          name={name}
          avatarUrl={conversation.avatar_url ?? contact.data?.avatar_url ?? null}
          members={members.data ?? []}
          onOpenPanel={() => setPanelOpen(true)}
        />
        {aiActive && (
          <AiBanner
            accountId={accountId}
            conversation={conversation}
            members={members.data ?? []}
          />
        )}
        <MessageThread
          key={conversation.id}
          accountId={accountId}
          aiActive={aiActive}
          conversationId={conversation.id}
          isGroup={conversation.is_group}
          contactName={name}
          members={members.data ?? []}
          onInbound={onInbound}
        />
        <CollisionBanner viewers={presence.viewers} />
        <Composer
          accountId={accountId}
          conversation={conversation}
          channel={channel}
          contactName={contact.data?.name ?? null}
          onTyping={presence.notifyTyping}
        />
      </div>
      <aside
        aria-label="Detalhes do contato"
        className="scrollbar-thin hidden w-[360px] shrink-0 overflow-y-auto border-l border-border bg-surface xl:block"
      >
        {panel}
      </aside>
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent
          side="right"
          className="scrollbar-thin w-full overflow-y-auto bg-surface p-0 sm:max-w-[380px]"
        >
          <SheetTitle className="sr-only">Detalhes do contato</SheetTitle>
          {panel}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BackBar() {
  return (
    <div className="flex h-14 items-center border-b border-border px-3 lg:hidden">
      <Button asChild variant="ghost" size="sm">
        <Link to="/inbox">
          <ArrowLeft /> Conversas
        </Link>
      </Button>
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Carregando conversa">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="flex-1 space-y-4 p-6">
        <Skeleton className="h-12 w-1/2 rounded-2xl" />
        <Skeleton className="ml-auto h-12 w-2/5 rounded-2xl" />
        <Skeleton className="h-16 w-3/5 rounded-2xl" />
      </div>
    </div>
  );
}
