import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Flag,
  Loader2,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { pendingItems, progress } from "@/features/coach/engine";
import { usePlaybooks } from "@/features/playbooks/api";
import { useAccount } from "@/lib/account";
import { initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { PersonaDialog } from "./PersonaDialog";
import { DifficultyChip, TrainingLobby } from "./TrainingLobby";
import { coveredFromMessages, type Difficulty } from "./roleplay";
import { usePersonas, useRoleplayAction, useSessions, type Session } from "./api";

// Treino com roleplay: o vendedor conversa com um cliente simulado pela IA e recebe nota pela rubrica.
export function TrainingPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const sessions = useSessions(accountId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const open = sessions.data?.find((s) => s.id === openId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Treino"
        description="Converse com clientes simulados pela IA, siga o playbook e receba nota com feedback"
        actions={
          isManager && !open ? (
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus /> Novo cliente simulado
            </Button>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {open ? (
          <SessionView accountId={accountId} session={open} onBack={() => setOpenId(null)} />
        ) : (
          <TrainingLobby
            accountId={accountId}
            isManager={isManager}
            sessions={sessions.data ?? []}
            loading={sessions.isPending}
            onOpen={setOpenId}
          />
        )}
      </div>
      <PersonaDialog
        accountId={accountId}
        open={creating}
        onOpenChange={setCreating}
        persona={null}
      />
    </div>
  );
}

function SessionView({
  accountId,
  session,
  onBack,
}: {
  accountId: string;
  session: Session;
  onBack: () => void;
}) {
  const personas = usePersonas(accountId);
  const playbooks = usePlaybooks(accountId);
  const act = useRoleplayAction(accountId);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const persona = personas.data?.find((p) => p.id === session.persona_id);
  const pb = playbooks.data?.find((p) => p.row.id === session.playbook_id)?.content ?? null;
  const state = useMemo(
    () => (pb ? coveredFromMessages(pb, session.messages) : null),
    [pb, session.messages],
  );
  const pending = pb && state ? pendingItems(state, pb) : [];
  const pct = pb && state ? Math.round(progress(state, pb) * 100) : 0;
  const finished = session.status === "finished";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.messages.length, act.isPending]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      await act.mutateAsync({ action: "reply", sessionId: session.id, text: t });
    } catch (err) {
      setText(t);
      toast.error(errorMessage(err));
    }
  }

  async function finish() {
    try {
      await act.mutateAsync({ action: "finish", sessionId: session.id });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-[560px] flex-col overflow-hidden rounded-[28px] border border-border bg-surface">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="grid size-9 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
            {initials(persona?.name ?? "?")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{persona?.name ?? "Cliente"}</p>
            <p className="truncate text-[11px] text-subtle">
              {[persona?.role, persona?.company].filter(Boolean).join(" · ") ||
                "Cliente simulado pela IA"}
            </p>
          </div>
          {!finished && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void finish()}
              disabled={act.isPending || !session.messages.some((m) => m.role === "seller")}
            >
              <Flag /> Encerrar e ver nota
            </Button>
          )}
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto bg-surface-2/30 px-4 py-5">
          {session.messages.map((m, i) => (
            <div
              key={i}
              className={cn("flex", m.role === "seller" ? "justify-end" : "justify-start")}
            >
              <p
                className={cn(
                  "max-w-[80%] rounded-[20px] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap",
                  m.role === "seller"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border bg-surface",
                )}
              >
                {m.text}
              </p>
            </div>
          ))}
          {act.isPending && !finished && (
            <div className="flex justify-start" aria-live="polite">
              <span
                className="inline-flex items-center gap-1 rounded-[20px] rounded-bl-md border border-border bg-surface px-4 py-3"
                aria-label={`${persona?.name ?? "Cliente"} está digitando`}
              >
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="size-1.5 animate-bounce rounded-full bg-subtle"
                    style={{ animationDelay: `${d * 120}ms` }}
                  />
                ))}
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {finished ? (
          <Result session={session} onBack={onBack} />
        ) : (
          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="O que você diria ao cliente? (Enter envia, Shift+Enter quebra linha)"
              className="min-h-0 resize-none"
              aria-label="Sua fala"
            />
            <Button
              type="submit"
              size="icon"
              disabled={act.isPending || !text.trim()}
              aria-label="Enviar"
            >
              {act.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </form>
        )}
      </section>

      <aside className="space-y-4">
        <section
          className="rounded-[24px] border border-border bg-surface p-5"
          aria-label="Roteiro"
        >
          <div className="flex items-center justify-between">
            <p className="eyebrow">Roteiro do playbook</p>
            <span className="text-[13px] font-semibold tabular-nums">{pb ? `${pct}%` : "—"}</span>
          </div>
          {pb ? (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <ul className="mt-4 space-y-3">
                {pb.phases.map((ph) => (
                  <li key={ph.id}>
                    <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
                      {ph.name}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {ph.items.map((it) => {
                        const done = state?.covered.includes(it.id);
                        return (
                          <li
                            key={it.id}
                            className={cn(
                              "flex items-start gap-2 text-[12px]",
                              done ? "text-subtle line-through" : "text-foreground",
                            )}
                          >
                            {done ? (
                              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                            ) : (
                              <Circle className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                            )}
                            {it.label}
                            {it.required && !done && <span className="text-danger">*</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
              {!finished && pending[0] && (
                <p className="mt-4 rounded-xl bg-surface-2 p-3 text-[12px] text-muted-foreground">
                  Próximo do roteiro:{" "}
                  <span className="font-medium text-foreground">{pending[0].label}</span>
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Sem playbook: a nota usa a rubrica padrão. Cadastre um em Ajustes › Playbooks para
              treinar o seu roteiro.
            </p>
          )}
        </section>
        {persona && (
          <section
            className="rounded-[24px] border border-border bg-surface p-5"
            aria-label="Quem é o cliente"
          >
            <div className="flex items-center justify-between">
              <p className="eyebrow">Quem é o cliente</p>
              <DifficultyChip d={persona.difficulty as Difficulty} />
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              {persona.profile || "Sem contexto cadastrado."}
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}

function Result({ session, onBack }: { session: Session; onBack: () => void }) {
  return (
    <div className="space-y-4 border-t border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-4 rounded-[24px] bg-[#0A1F3B] p-5 text-white">
        <span className="grid size-16 place-items-center rounded-full border-4 border-white/20 font-display text-[22px] font-semibold tabular-nums">
          {session.score ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.16em] text-white/60 uppercase">Nota do treino</p>
          <p className="mt-1 text-[13px] text-white/80">
            {session.feedback ?? "Avaliação concluída."}
          </p>
        </div>
        <Button variant="secondary" onClick={onBack}>
          Treinar de novo
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {session.criteria.map((c) => (
          <li key={c.id} className="rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium">{c.label}</p>
              <span className="font-display text-[14px] font-semibold tabular-nums">
                {c.score}/10
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${c.score * 10}%` }}
              />
            </div>
            {c.quote && (
              <p className="mt-2 text-[12px] text-muted-foreground italic">“{c.quote}”</p>
            )}
            {c.comment && <p className="mt-1 text-[12px] text-muted-foreground">{c.comment}</p>}
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <List title="Pontos fortes" icon={ThumbsUp} items={session.strengths} />
        <List title="Para melhorar" icon={ThumbsDown} items={session.improvements} />
      </div>
    </div>
  );
}

function List({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof ThumbsUp;
  items: string[];
}) {
  return (
    <section className="rounded-2xl border border-border p-4">
      <p className="eyebrow mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5" /> {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t) => (
            <li key={t} className="text-[13px]">
              • {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
