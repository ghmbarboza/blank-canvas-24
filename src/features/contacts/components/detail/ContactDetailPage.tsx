import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  LifeBuoy,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Bot,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { useClassifyContact, useContact, useContactConversations } from "../../api";
import { isPlatformSource, lifecycleLabel } from "../../types";
import { ContactFormDialog } from "../ContactFormDialog";
import { EmailComposerDialog } from "@/features/email/EmailComposerDialog";
import { hasChannel } from "@/lib/edition";
import { NewTicketDialog } from "@/features/support/NewTicketDialog";
import { HealthChip, useHealthMap } from "../../customer-health";
import { ContactAiPanel } from "./ContactAiPanel";
import { ContactProfileCard } from "./ContactProfileCard";
import { OpportunityBlock } from "@/features/opportunity/OpportunityBlock";
import { StartMeetingButton } from "@/features/meetings/StartMeetingButton";
import { ContactConversationsList, ContactDealsList, ContactNotes } from "./ContactRelatedLists";
import { AiCallButton } from "@/features/telephony/AiCallButton";
import { CallButton } from "@/features/telephony/softphone/CallButton";
import { Timeline360 } from "./Timeline360";
import { ContactConsentCard } from "./ContactConsentCard";
import { ContactCompanyCard } from "./ContactCompanyCard";

type Props = { contactId: string };

export function ContactDetailPage({ contactId }: Props) {
  const accountId = useAccountId();
  const navigate = useNavigate();
  const contact = useContact(accountId, contactId);
  const conversations = useContactConversations(accountId, contactId);
  const classify = useClassifyContact(accountId);
  const health = useHealthMap(accountId).map.get(contactId);
  const [editing, setEditing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [ticketing, setTicketing] = useState(false);

  async function reclassify() {
    try {
      await classify.mutateAsync(contactId);
      toast.success("Resumo do cliente atualizado");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function openConversation() {
    const first = conversations.data?.[0];
    if (first)
      void navigate({ to: "/inbox/$conversationId", params: { conversationId: first.id } });
  }

  if (contact.isPending) {
    return (
      <div className="space-y-4 p-6" aria-busy aria-label="Carregando contato">
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (contact.isError || !contact.data) {
    return (
      <EmptyState
        icon={UserX}
        title={contact.isError ? "Não deu para abrir este contato" : "Contato não encontrado"}
        description={
          contact.isError
            ? errorMessage(contact.error)
            : "Ele pode ter sido removido ou estar com outro responsável."
        }
        action={
          <Button asChild variant="outline">
            <Link to="/contatos">Voltar para clientes</Link>
          </Button>
        }
      />
    );
  }

  const c = contact.data;
  const subtitle = [c.job_title, c.company].filter(Boolean).join(" · ");
  const hasConversation = Boolean(conversations.data?.length);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="ds-page-header px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
        <Link
          to="/contatos"
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Clientes
        </Link>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <ContactAvatar
            name={c.name}
            src={c.avatar_url}
            platform={isPlatformSource(c.source) ? c.source : null}
            size={56}
          />
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Contato
            </p>
            <h1 className="truncate font-display text-[26px] leading-tight font-medium text-foreground sm:text-[30px]">
              {c.name ?? "Sem nome"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
              {subtitle && <span>{subtitle}</span>}
              <span className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px]">
                {lifecycleLabel(c.lifecycle)}
              </span>
              {health && <HealthChip level={health.result.level} score={health.result.score} />}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={openConversation}
              disabled={!hasConversation}
              title={hasConversation ? undefined : "Ainda não há conversa com essa pessoa"}
            >
              <MessageSquare aria-hidden /> Abrir conversa
            </Button>
            {hasChannel("email") && (
              <Button
                variant="outline"
                onClick={() => setEmailing(true)}
                disabled={!c.email}
                title={c.email ? undefined : "Cadastre um e-mail para enviar"}
              >
                <Mail aria-hidden /> Enviar e-mail
              </Button>
            )}
            <CallButton contactId={c.id} phone={c.phone} name={c.name} />
            <AiCallButton contactId={c.id} phone={c.phone} name={c.name} />
            <StartMeetingButton
              variant="outline"
              contactId={c.id}
              title={`Reunião com ${c.name ?? "contato"}`}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="Mais ações">
                  <MoreHorizontal aria-hidden /> Mais
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Editar dados
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTicketing(true)}>
                  <LifeBuoy /> Abrir chamado
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void reclassify()} disabled={classify.isPending}>
                  {classify.isPending ? <Loader2 className="animate-spin" /> : <Bot />}
                  Atualizar resumo com IA
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid gap-6 px-4 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10">
        <Tabs defaultValue="timeline" className="min-w-0">
          <TabsList className="mb-4 w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
            <TabsTrigger value="conversations">Conversas</TabsTrigger>
            <TabsTrigger value="deals">Carteira</TabsTrigger>
            <TabsTrigger value="notes">Notas</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline">
            <Timeline360 contactId={c.id} />
          </TabsContent>
          <TabsContent value="conversations">
            <ContactConversationsList accountId={accountId} contactId={c.id} />
          </TabsContent>
          <TabsContent value="deals">
            <ContactDealsList accountId={accountId} contactId={c.id} />
          </TabsContent>
          <TabsContent value="notes">
            <ContactNotes accountId={accountId} contactId={c.id} />
          </TabsContent>
        </Tabs>

        <aside className="space-y-4" aria-label="Resumo do contato">
          <ContactAiPanel accountId={accountId} contact={c} />
          <section
            className="rounded-2xl border border-border bg-surface p-5"
            aria-label="Jornada do cliente"
          >
            <p className="eyebrow mb-4">Jornada do cliente</p>
            <OpportunityBlock accountId={accountId} contact={c} />
          </section>
          <ContactCompanyCard accountId={accountId} contact={c} />
          <ContactProfileCard accountId={accountId} contact={c} />
          <ContactConsentCard accountId={accountId} contact={c} />
        </aside>
      </div>

      <EmailComposerDialog
        accountId={accountId}
        open={emailing}
        onOpenChange={setEmailing}
        contactId={c.id}
        toEmail={c.email}
        toName={c.name}
      />
      <NewTicketDialog
        accountId={accountId}
        open={ticketing}
        onOpenChange={setTicketing}
        defaults={{
          contact: { id: c.id, name: c.name, source: c.source, avatarUrl: c.avatar_url },
        }}
      />
      <ContactFormDialog
        accountId={accountId}
        open={editing}
        onOpenChange={setEditing}
        contact={c}
      />
    </div>
  );
}
