import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Loader2, MessageSquareText, Bot } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { formatListTime } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { agentKeys, agentsApi, useQuestions, type AskAnswer } from "./api";
import { usd } from "./ui-format";

const SUGGESTIONS: { label: string; question: string }[] = [
  {
    label: "Conversas passadas para a equipe",
    question: "Quantas conversas a IA passou para a equipe esta semana e quantas ficaram sem dono?",
  },
  {
    label: "Reclamações de entrega",
    question: "Quais clientes reclamaram de entrega nos últimos 7 dias?",
  },
  { label: "Ligações perdidas ontem", question: "Quantas ligações perdemos ontem?" },
  { label: "Funil deste mês", question: "Como está o funil de vendas deste mês?" },
];

type Shown = Pick<AskAnswer, "answer" | "links"> &
  Partial<Pick<AskAnswer, "used" | "created">> & {
    question: string;
    id?: string | undefined;
  };

function asLinks(raw: unknown): AskAnswer["links"] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is { label: string; href: string } =>
      typeof l === "object" &&
      l !== null &&
      typeof (l as Record<string, unknown>)["label"] === "string" &&
      typeof (l as Record<string, unknown>)["href"] === "string",
  );
}

/** Só caminho interno do app: a resposta vem do modelo e não pode levar para fora. */
function safeHref(href: string): string | null {
  return href.startsWith("/") && !href.startsWith("//") ? href : null;
}

// Pergunte ao Nexus: o gestor pergunta em português e a resposta vem dos relatórios, com número e link.
export function AskNexusPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const qc = useQueryClient();
  const history = useQuestions(accountId);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setQ(text);
    try {
      const r = await agentsApi<AskAnswer>(accountId, "ask", { question: text });
      setShown({ ...r, question: text });
      setQ("");
      await qc.invalidateQueries({ queryKey: agentKeys.questions(accountId) });
      if (r.created) await qc.invalidateQueries({ queryKey: agentKeys.list(accountId) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const items = history.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Pergunte ao Nexus"
        description="Pergunte sobre a operação como perguntaria a um analista. A resposta vem dos seus relatórios."
      />
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
        <div className="min-w-0 lg:overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(q);
              }}
            >
              <label htmlFor="ask-q" className="eyebrow">
                Sua pergunta
              </label>
              <div className="group mt-3 flex items-end gap-3 border-b-2 border-border pb-3 transition-colors focus-within:border-primary">
                <textarea
                  id="ask-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask(q);
                    }
                  }}
                  rows={2}
                  placeholder={
                    isManager
                      ? "O que você precisa saber da operação hoje?"
                      : "Ex.: quantas conversas eu tenho esperando resposta?"
                  }
                  className="min-h-0 flex-1 resize-none bg-transparent font-display text-[20px] leading-snug text-foreground outline-none placeholder:text-subtle sm:text-[24px]"
                />
                <button
                  type="submit"
                  disabled={busy || !q.trim()}
                  aria-label="Perguntar"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-[12px] text-subtle">
                Usa a chave de IA da sua empresa. Só lê os dados, nunca muda nada.
                {isManager &&
                  " Também cria agentes: “cria um agente de cobrança que parcela em 3x”."}
              </p>
            </form>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-1">Sugestões</span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void ask(s.question)}
                  disabled={busy}
                  title={s.question}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="mt-12" aria-live="polite">
              {busy ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Consultando os
                    relatórios…
                  </p>
                  <Skeleton className="h-40 w-full rounded-2xl" />
                </div>
              ) : error ? (
                <div
                  role="alert"
                  className="rounded-2xl border border-danger/30 bg-danger/5 px-5 py-4 text-[13px] text-danger"
                >
                  {error}
                </div>
              ) : shown ? (
                <AnswerView answer={shown} />
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                  <MessageSquareText className="mx-auto size-5 text-subtle" aria-hidden />
                  <p className="mt-3 text-[14px] font-medium">Pergunte com número e período</p>
                  <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
                    “Quantas conversas ficaram sem resposta ontem?” funciona melhor que “como estão
                    as conversas?”. A resposta traz o número e o link para conferir.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside
          aria-labelledby="ask-hist"
          className="border-t border-border bg-surface-2/40 px-4 py-8 sm:px-8 lg:overflow-y-auto lg:border-t-0 lg:border-l lg:px-6"
        >
          <h2 id="ask-hist" className="eyebrow mb-5">
            Histórico de consultas
          </h2>
          {history.isPending ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Suas perguntas ficam aqui para consultar depois.
            </p>
          ) : (
            <ul className="space-y-1">
              {items.map((h) => {
                const active = shown?.id === h.id;
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setShown({
                          id: h.id,
                          question: h.question,
                          answer: h.answer ?? "",
                          links: asLinks(h.links),
                        });
                      }}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "relative w-full rounded-lg py-2.5 pr-2 pl-4 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active && "bg-surface",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full",
                          active ? "bg-primary" : "bg-transparent",
                        )}
                        aria-hidden
                      />
                      <span className="block text-[11px] text-subtle tabular-nums">
                        {formatListTime(h.created_at)}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 line-clamp-3 block text-[13px] leading-snug",
                          active ? "font-medium text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {h.question}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function AnswerView({ answer }: { answer: Shown }) {
  const sources = [...new Set(answer.used ?? [])].map((s) => s.replace(/_/g, " "));
  const links = answer.links
    .map((l) => ({ ...l, href: safeHref(l.href) }))
    .filter((l): l is { label: string; href: string } => l.href !== null);
  return (
    <article className="space-y-5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border pb-3 text-[12px] text-subtle">
        <Bot className="size-3.5" aria-hidden />
        {sources.length > 0 ? (
          <>
            Resposta baseada em{" "}
            {sources.map((s, i) => (
              <span key={s}>
                <span className="font-medium text-foreground">{s}</span>
                {i < sources.length - 1 && ","}
              </span>
            ))}
          </>
        ) : (
          "Resposta baseada nos seus relatórios"
        )}
      </p>
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <p className="text-[13px] text-muted-foreground">{answer.question}</p>
        <p className="mt-4 text-[17px] leading-relaxed whitespace-pre-wrap text-foreground">
          {answer.answer}
        </p>
        {links.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {l.label} <ArrowUpRight className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      {answer.created && (
        <section className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-primary">
          <p className="text-[11px] font-medium opacity-70">Feito agora</p>
          <p className="mt-1 font-display text-[19px] font-semibold">
            {answer.created.name} criado
          </p>
          <p className="mt-1 text-[13px] opacity-80">
            Com {answer.created.cases} perguntas de teste. Avaliação estimada em{" "}
            {usd(answer.created.estimate.usd)}.
          </p>
          <Link
            to="/equipe-ia"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-medium hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            Abrir na Equipe de IA <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </section>
      )}
    </article>
  );
}
