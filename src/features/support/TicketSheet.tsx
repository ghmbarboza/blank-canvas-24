import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CircleDot,
  Loader2,
  Lock,
  MessageSquare,
  Send,
  Bot,
  Star,
  Timer,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useTeamMembers } from "@/features/contacts/api";
import { OwnerSelect } from "@/features/contacts/components/OwnerSelect";
import { callApi } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { callFunction, errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useAddTicketComment,
  useTicket,
  useTicketEvents,
  useUpdateTicket,
  type TicketEvent,
} from "./api";
import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  type TicketPriority,
  type TicketStatus,
} from "./constants";
import { AiReplyCard, RecentConversation, TicketArticleCard } from "./TicketSheetParts";
import { SlaChip } from "./SlaChip";
import { TicketLinks } from "./TicketLinks";

type TimelineFilter = "all" | "replies" | "notes";
const TIMELINE_FILTERS: [TimelineFilter, string][] = [
  ["all", "Tudo"],
  ["replies", "Respostas"],
  ["notes", "Notas internas"],
];

interface Props {
  accountId: string;
  ticketId: string | null;
  onClose: () => void;
}

const EVENT_ICON: Record<string, LucideIcon> = {
  created: CircleDot,
  status: ArrowRightLeft,
  assign: UserCheck,
  priority: ArrowRightLeft,
  sla: Timer,
  csat: Star,
  system: Bot,
};

// Detalhe do chamado: dados, histórico em tempo real e resposta (pública para o cliente ou nota interna).
export function TicketSheet({ accountId, ticketId, onClose }: Props) {
  const ticket = useTicket(accountId, ticketId);
  const events = useTicketEvents(accountId, ticketId);
  const update = useUpdateTicket(accountId);
  const comment = useAddTicketComment(accountId);
  const team = useTeamMembers(accountId);
  const [body, setBody] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [sending, setSending] = useState(false);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const t = ticket.data;
  const [timeline, setTimeline] = useState<TimelineFilter>("all");
  const allEvents = events.data ?? [];
  const notesCount = allEvents.filter((e) => e.kind === "comment" && !e.is_public).length;
  const shownEvents = allEvents.filter((e) =>
    timeline === "all"
      ? true
      : timeline === "notes"
        ? e.kind === "comment" && !e.is_public
        : e.kind === "comment" && e.is_public,
  );

  function patch(p: Parameters<typeof update.mutate>[0]["patch"]) {
    if (!t) return;
    update.mutate({ id: t.id, patch: p }, { onError: (e) => toast.error(errorMessage(e)) });
  }

  async function send() {
    if (!t || !body.trim()) return;
    setSending(true);
    try {
      if (isPublic && t.conversation_id) {
        await callFunction("send-message", {
          accountId,
          conversationId: t.conversation_id,
          text: body.trim(),
        });
        await comment.mutateAsync({ ticketId: t.id, body: body.trim(), isPublic: true });
      } else if (isPublic && t.contact?.email) {
        await callApi("/api/support", {
          accountId,
          action: "ticket.reply_email",
          ticketId: t.id,
          body: body.trim(),
        });
      } else {
        await comment.mutateAsync({ ticketId: t.id, body: body.trim(), isPublic });
      }
      if (isPublic && t.status === "open") patch({ status: "pending" });
      setBody("");
      toast.success(isPublic ? "Resposta enviada ao cliente" : "Nota interna salva");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const canReachCustomer = Boolean(t?.conversation_id || t?.contact?.email);

  return (
    <Sheet open={Boolean(ticketId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        {!t ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="atmosphere border-b border-border px-4 py-5 text-left sm:px-6">
              <p className="font-mono text-[12px] text-subtle">
                Chamado #{t.number} · {SOURCE_LABEL[t.source] ?? t.source}
              </p>
              <SheetTitle className="font-display text-[20px] leading-tight">
                {t.subject}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <SlaChip ticket={t} />
                {t.csat_score && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-medium">
                    <Star className="size-3" /> CSAT {t.csat_score}/5
                  </span>
                )}
                {t.contact && (
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: t.contact.id }}
                    className="text-[12px] underline-offset-2 hover:underline"
                  >
                    {t.contact.name ?? t.contact.email ?? "Cliente"}
                  </Link>
                )}
                {t.conversation_id && (
                  <Link
                    to="/inbox/$conversationId"
                    params={{ conversationId: t.conversation_id }}
                    className="inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline"
                  >
                    <MessageSquare className="size-3" /> abrir conversa
                  </Link>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-4 sm:grid-cols-4 sm:px-6">
              <div className="grid gap-1">
                <Label className="text-[11px] text-subtle">Status</Label>
                <Select
                  value={t.status}
                  onValueChange={(v) => patch({ status: v as TicketStatus })}
                >
                  <SelectTrigger className="h-9" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px] text-subtle">Prioridade</Label>
                <Select
                  value={t.priority}
                  onValueChange={(v) => patch({ priority: v as TicketPriority })}
                >
                  <SelectTrigger className="h-9" aria-label="Prioridade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_ORDER.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[11px] text-subtle">Responsável</Label>
                <OwnerSelect
                  members={team.data ?? []}
                  value={t.owner_user_id}
                  onChange={(v) => patch({ owner_user_id: v })}
                  aria-label="Responsável"
                  className="h-9"
                />
              </div>
              <div className="grid content-start gap-1">
                <span className="text-[11px] text-subtle">Criado</span>
                <span
                  className="flex h-9 items-center text-[13px] tabular-nums"
                  title={formatDateTime(t.created_at)}
                >
                  {formatRelative(t.created_at)}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {t.description && (
                <section className="mb-6">
                  <h3 className="eyebrow mb-2">O que o cliente pediu</h3>
                  <p className="rounded-2xl border border-border bg-surface p-4 text-[14px] leading-relaxed whitespace-pre-wrap">
                    {t.description}
                  </p>
                </section>
              )}
              {t.conversation_id && (
                <RecentConversation accountId={accountId} conversationId={t.conversation_id} />
              )}
              <TicketArticleCard accountId={accountId} ticket={t} />
              <section aria-labelledby="ticket-historico" className="mb-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 id="ticket-historico" className="eyebrow">
                    Respostas e notas
                  </h3>
                  <div role="radiogroup" aria-label="Mostrar" className="flex gap-1">
                    {TIMELINE_FILTERS.map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={timeline === k}
                        onClick={() => setTimeline(k)}
                        className={cn(
                          "h-7 rounded-full border px-2.5 text-[11px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
                          timeline === k
                            ? "border-primary bg-primary-soft text-foreground"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                        {k === "notes" && notesCount > 0 && (
                          <span className="ml-1 tabular-nums opacity-70">{notesCount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {events.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : shownEvents.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[12px] text-subtle">
                    {timeline === "notes"
                      ? "Nenhuma nota interna. Use a aba Nota interna abaixo: só a equipe vê."
                      : "Nenhuma resposta ainda. Escreva abaixo ou use a resposta sugerida."}
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {shownEvents.map((e) => (
                      <EventRow
                        key={e.id}
                        e={e}
                        author={e.author_user_id ? names.get(e.author_user_id) : undefined}
                      />
                    ))}
                  </ol>
                )}
              </section>
              <section aria-label="Vínculos">
                <h3 className="eyebrow mb-2">Vínculos</h3>
                <TicketLinks accountId={accountId} ticket={t} />
              </section>
            </div>

            <div className="max-h-[55vh] overflow-y-auto border-t border-border bg-background px-4 py-4 sm:px-6">
              <div className="mb-2 flex gap-1 text-[12px]">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  disabled={!canReachCustomer}
                  className={cn(
                    "rounded-full px-3 py-1",
                    isPublic && canReachCustomer
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface-2",
                    !canReachCustomer && "opacity-40",
                  )}
                  title={
                    canReachCustomer ? undefined : "Chamado sem conversa nem e-mail do cliente"
                  }
                >
                  Responder ao cliente
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1",
                    !isPublic || !canReachCustomer
                      ? "bg-note text-note-fg"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <Lock className="size-3" /> Nota interna
                </button>
              </div>
              <AiReplyCard accountId={accountId} ticket={t} onPick={setBody} />
              <Textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  isPublic && canReachCustomer
                    ? t.conversation_id
                      ? "Vai pela conversa do cliente…"
                      : `Vai por e-mail para ${t.contact?.email}…`
                    : "Só a equipe vê"
                }
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-subtle">
                  ⌘ Enter envia · criado {formatRelative(t.created_at)}
                </p>
                <Button size="sm" onClick={() => void send()} disabled={sending || !body.trim()}>
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}{" "}
                  {isPublic && canReachCustomer ? "Enviar" : "Salvar nota"}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EventRow({ e, author }: { e: TicketEvent; author: string | undefined }) {
  const meta = (e.meta ?? {}) as Record<string, string | number | null>;
  if (e.kind === "comment") {
    const fromCustomer = !e.author_user_id && meta["from"] === "customer";
    return (
      <li
        className={cn(
          "rounded-2xl p-3 text-[13px]",
          e.is_public ? "border border-border bg-surface" : "bg-note text-note-fg",
        )}
      >
        <p className="mb-1 flex items-center gap-1.5 text-[11px] opacity-70">
          {!e.is_public && <Lock className="size-3" />}
          {fromCustomer ? "Cliente" : (author ?? "Equipe")} ·{" "}
          {fromCustomer ? "pelo portal" : e.is_public ? "resposta ao cliente" : "nota interna"} ·{" "}
          <time title={formatDateTime(e.created_at)}>{formatRelative(e.created_at)}</time>
        </p>
        <p className="whitespace-pre-wrap">{e.body}</p>
      </li>
    );
  }
  const Icon = EVENT_ICON[e.kind] ?? CircleDot;
  let text = e.body ?? "";
  if (e.kind === "status")
    text = `Status: ${STATUS_LABEL[meta["from"] as TicketStatus] ?? meta["from"]} → ${STATUS_LABEL[meta["to"] as TicketStatus] ?? meta["to"]}`;
  if (e.kind === "priority")
    text = `Prioridade: ${PRIORITY_LABEL[meta["from"] as TicketPriority] ?? meta["from"]} → ${PRIORITY_LABEL[meta["to"] as TicketPriority] ?? meta["to"]}`;
  if (e.kind === "assign") text = meta["to"] ? "Responsável alterado" : "Responsável removido";
  if (e.kind === "created") text = "Chamado aberto";
  if (e.kind === "csat")
    text = `Cliente avaliou: ${meta["score"]}/5${e.body ? ` — “${e.body}”` : ""}`;
  return (
    <li className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <Icon className={cn("size-3.5 shrink-0", e.kind === "sla" && "text-danger")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {text}
        {author && ` · ${author}`}
      </span>
      <time className="shrink-0 text-[11px] text-subtle" title={formatDateTime(e.created_at)}>
        {formatRelative(e.created_at)}
      </time>
    </li>
  );
}
