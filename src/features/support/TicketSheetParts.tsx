import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, Loader2, MessageSquare, Bot } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { useSuggestReplies } from "@/features/inbox/api-messages";
import { useAccount } from "@/lib/account";
import { callApi } from "@/lib/api";
import { formatListTime } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useConversationTail, useTicketArticle, type TicketRow } from "./api";
import { MacroSuggest } from "./MacroSuggest";
import { markdownExcerpt } from "./markdown";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="eyebrow mb-2">{children}</h3>;
}

// Últimas mensagens da conversa de origem: o atendente lê o contexto sem sair do chamado.
export function RecentConversation({
  accountId,
  conversationId,
}: {
  accountId: string;
  conversationId: string;
}) {
  const tail = useConversationTail(accountId, conversationId);
  return (
    <section aria-labelledby="ticket-conversa" className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="ticket-conversa" className="eyebrow">
          Conversa com o cliente
        </h3>
        <Link
          to="/inbox/$conversationId"
          params={{ conversationId }}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MessageSquare className="size-3" aria-hidden /> Abrir conversa
        </Link>
      </div>
      {tail.isPending ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : tail.isError ? (
        <p className="text-[12px] text-danger">{errorMessage(tail.error)}</p>
      ) : (tail.data ?? []).length === 0 ? (
        <p className="text-[12px] text-subtle">A conversa ainda não tem mensagens.</p>
      ) : (
        <ol className="space-y-2 rounded-2xl bg-surface-2/60 p-3">
          {(tail.data ?? []).map((m) => {
            const fromCustomer = m.direction === "in";
            const text = m.body ?? m.transcript ?? (m.type === "text" ? "" : `[${m.type}]`);
            return (
              <li key={m.id} className={cn("flex", fromCustomer ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                    fromCustomer
                      ? "border border-border bg-surface"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  <p className="mb-0.5 text-[11px] opacity-70">
                    {fromCustomer
                      ? (m.sender_name ?? "Cliente")
                      : m.sender_type === "ai"
                        ? "IA"
                        : (m.sender_name ?? "Equipe")}{" "}
                    · <time className="tabular-nums">{formatListTime(m.created_at)}</time>
                  </p>
                  <p className="line-clamp-4 whitespace-pre-wrap">{text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// Artigo da base ligado (ou o rascunho que a IA escreveu); no resolvido, o gestor pode gerar um.
export function TicketArticleCard({
  accountId,
  ticket: t,
}: {
  accountId: string;
  ticket: TicketRow;
}) {
  const { isManager } = useAccount();
  const article = useTicketArticle(accountId, t.id, t.kb_article_id);
  const draft = useMutation({
    mutationFn: () =>
      callApi<{ articleId?: string; skipped?: string }>("/api/sac", {
        accountId,
        action: "kb.draft",
        ticketId: t.id,
      }),
    onSuccess: (r) => {
      if (r.articleId) toast.success("Rascunho criado na base de conhecimento");
      else toast.info(r.skipped ?? "Sem rascunho");
      void article.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resolved = t.status === "resolved" || t.status === "closed";
  const a = article.data;

  if (article.isPending) return <Skeleton className="mb-6 h-20 w-full rounded-2xl" />;
  if (!a && !(resolved && isManager)) return null;

  return (
    <section aria-labelledby="ticket-artigo" className="mb-6">
      <SectionTitle>
        <span id="ticket-artigo">Artigo da base</span>
      </SectionTitle>
      {a ? (
        <Link
          to="/atendimento/base"
          className="lift block rounded-2xl border border-border bg-surface p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{a.title}</span>
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-medium text-muted-foreground">
              {a.status === "draft" ? "Rascunho" : a.linked ? "Ligado" : "Publicado"}
            </span>
          </p>
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
            {markdownExcerpt(a.body_md) || "Artigo sem texto ainda."}
          </p>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => draft.mutate()}
          disabled={draft.isPending}
          className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3 text-left text-[13px] text-muted-foreground hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          {draft.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Bot className="size-4" aria-hidden />
          )}
          Virar artigo da base: a IA escreve o rascunho a partir deste chamado
        </button>
      )}
    </section>
  );
}

// Resposta sugerida: respostas prontas (macros) pela intenção e, com conversa, rascunhos da IA.
export function AiReplyCard({
  accountId,
  ticket: t,
  onPick,
}: {
  accountId: string;
  ticket: TicketRow;
  onPick: (text: string) => void;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-primary-line bg-primary-soft/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
        <Bot className="size-3.5" aria-hidden /> Resposta sugerida
        <span className="font-normal text-subtle">· revise antes de enviar</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <MacroSuggest accountId={accountId} ticketId={t.id} onPick={onPick} />
        {t.conversation_id && (
          <AiDrafts accountId={accountId} conversationId={t.conversation_id} onPick={onPick} />
        )}
      </div>
    </div>
  );
}

function AiDrafts({
  accountId,
  conversationId,
  onPick,
}: {
  accountId: string;
  conversationId: string;
  onPick: (text: string) => void;
}) {
  const suggest = useSuggestReplies(accountId, conversationId);
  const list = suggest.data ?? [];
  if (list.length > 0)
    return (
      <ul className="mt-1 grid w-full gap-1.5" aria-label="Rascunhos da IA">
        {list.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => {
                onPick(s.text);
                suggest.reset();
              }}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-left text-[12px] leading-relaxed hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]"
            >
              <span className="block text-[11px] font-medium text-subtle">{s.label}</span>
              <span className="line-clamp-3">{s.text}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <button
      type="button"
      onClick={() => suggest.mutate()}
      disabled={suggest.isPending}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
    >
      {suggest.isPending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Bot className="size-3.5" aria-hidden />
      )}
      Escrever com a IA
    </button>
  );
}
