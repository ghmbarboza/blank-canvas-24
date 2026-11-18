import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, History, MessageSquare, Bot } from "lucide-react";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { OriginChip } from "@/components/common/OriginChip";
import { describeOrigin, type TouchLike } from "@/features/contacts/origin";
import { TempChip } from "@/components/common/TempChip";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatPhone, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CallButton } from "@/features/telephony/softphone/CallButton";

import { useContactConversations, useContactDeals } from "../api";
import {
  isPlatformSource,
  lifecycleLabel,
  sourceLabel,
  type ContactRow,
  type TeamMember,
} from "../types";
import { ChannelBadges } from "./ChannelBadges";
import { useContactConsentState, useTimeline360 } from "./detail/hooks";
import { TimelineEntry } from "./detail/Timeline360";
import { OwnerAvatar } from "./OwnerAvatar";
import { countLabel } from "@/lib/plural";

const TIMELINE_PREVIEW = 6;

type Props = {
  accountId: string;
  contact: ContactRow | undefined;
  platforms: string[] | undefined;
  owner: TeamMember | undefined;
  onClose: () => void;
};

// Gaveta 360: o essencial do contato sem sair da lista (IA, dados, negócios, histórico).
export function ContactDrawer({ contact, onClose, ...rest }: Props) {
  return (
    <Sheet open={Boolean(contact)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[460px]">
        {contact && <DrawerBody key={contact.id} contact={contact} {...rest} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  accountId,
  contact: c,
  platforms,
  owner,
}: Omit<Props, "contact" | "onClose"> & { contact: ContactRow }) {
  const navigate = useNavigate();
  const conversations = useContactConversations(accountId, c.id);
  const firstConversation = conversations.data?.[0];
  const role = [c.job_title, c.company].filter(Boolean).join(" na ");

  return (
    <>
      <SheetHeader className="space-y-0 border-b border-border px-6 pt-6 pb-5 text-left">
        <div className="flex items-start gap-4 pr-6">
          <ContactAvatar
            name={c.name}
            src={c.avatar_url}
            platform={isPlatformSource(c.source) ? c.source : null}
            size={56}
          />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate font-display text-[20px] font-medium">
              {c.name ?? "Sem nome"}
            </SheetTitle>
            <SheetDescription className="truncate text-[13px] text-muted-foreground">
              {role || lifecycleLabel(c.lifecycle)}
            </SheetDescription>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TempChip level={c.temperature} score={c.score} />
              <ChannelBadges contact={c} platforms={platforms} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              firstConversation &&
              void navigate({
                to: "/inbox/$conversationId",
                params: { conversationId: firstConversation.id },
              })
            }
            disabled={!firstConversation}
            title={firstConversation ? undefined : "Ainda não há conversa com essa pessoa"}
          >
            <MessageSquare aria-hidden /> Mensagem
          </Button>
          <CallButton contactId={c.id} phone={c.phone} name={c.name} size="sm" />
          <Button asChild size="sm" variant="ghost" className="ml-auto">
            <Link to="/contatos/$contactId" params={{ contactId: c.id }}>
              Ficha completa <ArrowUpRight aria-hidden />
            </Link>
          </Button>
        </div>
      </SheetHeader>

      <div className="space-y-6 px-6 py-5">
        <NextStep contact={c} />
        <Facts accountId={accountId} contact={c} owner={owner} />
        <OpenDeals accountId={accountId} contactId={c.id} />
        <RecentHistory contactId={c.id} />
      </div>
    </>
  );
}

function NextStep({ contact: c }: { contact: ContactRow }) {
  if (!c.ai_next_step) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
        Quando houver conversa suficiente, a IA sugere aqui o próximo passo com essa pessoa.
      </p>
    );
  }
  return (
    <section
      aria-label="Próximo passo sugerido pela IA"
      className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-primary"
    >
      <p className="flex items-center gap-1.5 text-[12px] font-medium opacity-80">
        <Bot className="size-3.5" aria-hidden /> Próximo passo sugerido pela IA
        {c.classified_at && (
          <span className="ml-auto tabular-nums">{formatRelative(c.classified_at)}</span>
        )}
      </p>
      {c.ai_summary && (
        <p className="mt-2 text-[13px] leading-relaxed opacity-80">{c.ai_summary}</p>
      )}
      <p className="mt-3 flex gap-2 text-[15px] leading-snug font-medium">
        <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden />
        {c.ai_next_step}
      </p>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-foreground">{children}</dd>
    </div>
  );
}

function Facts({
  accountId,
  contact: c,
  owner,
}: {
  accountId: string;
  contact: ContactRow;
  owner: TeamMember | undefined;
}) {
  const consent = useContactConsentState(accountId, c);
  const blocked = consent.data?.suppressions.length ?? 0;
  const granted = consent.data?.consents.filter((x) => x.status === "granted").length ?? 0;
  const consentText = consent.isPending
    ? "Conferindo…"
    : blocked > 0
      ? `Bloqueado em ${countLabel(blocked, "canal", "canais")}`
      : granted > 0
        ? `Consentimento ativo em ${countLabel(granted, "canal", "canais")}`
        : "Interesse legítimo, sem registro";

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      <Fact label="Consentimento (LGPD)">
        <span className={cn(blocked > 0 && "font-medium text-danger")}>{consentText}</span>
      </Fact>
      <Fact label="De onde veio">
        {describeOrigin(c.first_touch as TouchLike | null) ? (
          <OriginChip touch={c.first_touch as TouchLike | null} />
        ) : (
          sourceLabel(c.source)
        )}
      </Fact>
      <Fact label="E-mail">{c.email ?? "—"}</Fact>
      <Fact label="Telefone">{c.phone ? formatPhone(c.phone) : "—"}</Fact>
      <Fact label="Responsável">
        <span className="flex items-center gap-1.5">
          <OwnerAvatar member={owner} size={18} />
          <span className="truncate">{owner?.name ?? "Sem responsável"}</span>
        </span>
      </Fact>
      <Fact label="Último contato">{formatRelative(c.last_interaction_at)}</Fact>
    </dl>
  );
}

function OpenDeals({ accountId, contactId }: { accountId: string; contactId: string }) {
  const deals = useContactDeals(accountId, contactId);
  const open = (deals.data ?? []).filter((d) => d.status === "open");
  return (
    <section aria-labelledby="drawer-deals">
      <h3 id="drawer-deals" className="eyebrow mb-2">
        Na carteira
      </h3>
      {deals.isPending ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : deals.isError ? (
        <p className="text-[13px] text-danger">Não deu para carregar a carteira deste cliente.</p>
      ) : open.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Ainda não está na carteira. Coloque pela tela Carteira quando ele comprar.
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((d) => (
            <li key={d.id}>
              <Link
                to="/crm"
                search={{ negocio: d.id }}
                className="lift block rounded-xl border border-border bg-surface p-3.5 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-medium">{d.title}</span>
                  <span className="shrink-0 font-display text-[15px] font-semibold tabular-nums">
                    {formatMoney(d.value)}
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-[2px] text-[11px] font-medium">
                    {d.stageName}
                  </span>
                  Atualizado {formatRelative(d.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentHistory({ contactId }: { contactId: string }) {
  const q = useTimeline360(contactId);
  const rows = (q.data?.pages ?? []).flat().slice(0, TIMELINE_PREVIEW);
  return (
    <section aria-labelledby="drawer-history">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="drawer-history" className="eyebrow">
          Linha do tempo
        </h3>
        <Link
          to="/contatos/$contactId"
          params={{ contactId }}
          className="text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Ver tudo
        </Link>
      </div>
      {q.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : q.isError ? (
        <p className="text-[13px] text-danger">Não deu para carregar o histórico.</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <History className="size-4 text-subtle" aria-hidden /> Nenhuma interação registrada ainda.
        </p>
      ) : (
        <ol>
          {rows.map((r) => (
            <TimelineEntry key={`${r.kind}-${r.ref_id}`} r={r} />
          ))}
        </ol>
      )}
    </section>
  );
}
