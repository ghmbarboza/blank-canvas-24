import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Briefcase, Loader2, MessagesSquare, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { formatListTime, formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stageBarClass } from "@/features/crm/stageColors";

import {
  useAddContactNote,
  useContactActivities,
  useContactConversations,
  useContactDeals,
} from "../../api";
import { TimelineItem } from "./TimelineItem";
import { activityMeta } from "./activityMeta";

type Props = { accountId: string; contactId: string };

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Pendente",
  snoozed: "Adiada",
  closed: "Encerrada",
};

export function ContactConversationsList({ accountId, contactId }: Props) {
  const { data, isPending, isError } = useContactConversations(accountId, contactId);
  if (isPending) return <ListSkeleton />;
  if (isError)
    return <p className="text-[13px] text-danger">Não deu para carregar as conversas.</p>;
  if (!data.length) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Nenhuma conversa ainda"
        description="Quando essa pessoa mandar mensagem por um canal conectado, a conversa aparece aqui."
        className="py-10"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {data.map((c) => (
        <li key={c.id}>
          <Link
            to="/inbox/$conversationId"
            params={{ conversationId: c.id }}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChannelIcon platform={c.platform} size={22} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{c.channelName}</span>
                <span className="text-[11px] text-subtle tabular-nums">
                  {formatListTime(c.lastMessageAt)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="truncate text-[12px] text-muted-foreground">
                  {c.preview ?? "Sem mensagens"}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-subtle">
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
                {c.unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                    {c.unread}
                  </span>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const DEAL_STATUS: Record<string, { label: string; className: string }> = {
  open: { label: "Na carteira", className: "text-muted-foreground" },
  won: { label: "Fidelizado", className: "text-foreground" },
  lost: { label: "Perdido", className: "text-danger" },
};

export function ContactDealsList({ accountId, contactId }: Props) {
  const { data, isPending, isError } = useContactDeals(accountId, contactId);
  if (isPending) return <ListSkeleton />;
  if (isError)
    return (
      <p className="text-[13px] text-danger">Não deu para carregar a carteira deste cliente.</p>
    );
  if (!data.length) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Este contato ainda não está na carteira"
        description="Quando ele comprar, coloque na Carteira para acompanhar em que etapa da jornada ele está."
        action={
          <Button asChild variant="outline">
            <Link to="/crm">Abrir a Carteira</Link>
          </Button>
        }
        className="py-10"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {data.map((d) => {
        const status = DEAL_STATUS[d.status] ?? DEAL_STATUS["open"]!;
        return (
          <li
            key={d.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <span
              className={cn("h-8 w-1 shrink-0 rounded-full", stageBarClass(d.stageColor))}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{d.title}</span>
              <span className="text-[12px] text-subtle">
                {d.stageName} · <span className={status.className}>{status.label}</span> ·{" "}
                {formatRelative(d.updatedAt)}
              </span>
            </span>
            <span className="font-display text-[15px] font-semibold tabular-nums">
              {formatMoney(d.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ContactNotes({ accountId, contactId }: Props) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const add = useAddContactNote(accountId, contactId);
  const activities = useContactActivities(accountId, contactId);
  const notes = (activities.data ?? []).filter((a) => a.type === "note");

  async function submit() {
    const text = body.trim();
    if (!text || !user) return;
    try {
      await add.mutateAsync({ body: text.slice(0, 5000), userId: user.id });
      setBody("");
      toast.success("Nota adicionada");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const meta = activityMeta("note");
  const Icon = meta.icon;

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="rounded-xl border border-note-line bg-note p-3"
      >
        <label htmlFor="contact-note" className="sr-only">
          Nova nota
        </label>
        <Textarea
          id="contact-note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          placeholder="Escreva o que a equipe precisa saber sobre essa pessoa"
          className="min-h-20 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-note-fg">Só a equipe vê. Ctrl + Enter salva.</span>
          <Button type="submit" size="sm" disabled={!body.trim() || add.isPending}>
            {add.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Salvar nota
          </Button>
        </div>
      </form>
      {activities.isPending ? (
        <ListSkeleton />
      ) : notes.length ? (
        <ol>
          {notes.map((n) => (
            <TimelineItem
              key={n.id}
              icon={<Icon className="size-3.5" />}
              tone={meta.tone}
              title="Nota"
              at={n.created_at}
            >
              {n.body}
            </TimelineItem>
          ))}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-subtle">
          <StickyNote className="size-4" aria-hidden /> Nenhuma nota ainda.
        </p>
      )}
    </div>
  );
}
