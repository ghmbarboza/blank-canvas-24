import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Loader2, Bot, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCompleteTask, useFollowUpDeal, useLeadExtras, type MyDay } from "./api";
import { daysSince, formatClock } from "./format";

const TYPE_LABEL: Record<string, string> = {
  task: "Tarefa",
  call: "Ligar",
  email: "E-mail",
  meeting: "Reunião",
  whatsapp: "WhatsApp",
};

function ListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}

// ───────────────────────── tarefas ─────────────────────────
interface TasksProps {
  accountId: string;
  tasks: MyDay["tasks"] | undefined;
  tz: string;
}

export function TaskPanel({ accountId, tasks, tz }: TasksProps) {
  const complete = useCompleteTask(accountId);
  return (
    <section
      aria-labelledby="meu-dia-tarefas"
      className="rounded-2xl border border-border bg-surface p-5"
    >
      <header className="mb-4 flex items-center justify-between gap-2">
        <h2 id="meu-dia-tarefas" className="eyebrow">
          Tarefas pendentes
        </h2>
        {tasks && <span className="text-[11px] text-subtle tabular-nums">{tasks.length}</span>}
      </header>
      {!tasks ? (
        <ListSkeleton />
      ) : tasks.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nada pendente. Bom momento para dar um toque em quem está sem acompanhamento.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {tasks.map((t) => {
            const title = t.title ?? TYPE_LABEL[t.type] ?? "Tarefa";
            const overdue = Boolean(t.overdue);
            const meta = [
              TYPE_LABEL[t.type] ?? t.type,
              t.contact_name,
              t.due_at && !overdue ? `até ${formatClock(t.due_at, tz)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={t.id} className="row-wash group flex items-start gap-3 rounded-xl px-2 py-2">
                <button
                  type="button"
                  aria-label={`Concluir: ${title}`}
                  onClick={() =>
                    complete.mutate(t.id, {
                      onSuccess: () => toast.success("Tarefa concluída"),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                  className={cn(
                    "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-md border-2 bg-surface text-transparent transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.94]",
                    overdue ? "border-danger" : "border-border-strong",
                  )}
                >
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{title}</p>
                  {overdue && t.due_at ? (
                    <p className="text-[12px] text-danger">Atrasada · {formatRelative(t.due_at)}</p>
                  ) : (
                    meta && <p className="truncate text-[12px] text-subtle">{meta}</p>
                  )}
                </div>
                {t.contact_id && (
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: t.contact_id }}
                    className="mt-0.5 shrink-0 rounded-full text-subtle opacity-60 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Abrir contato ${t.contact_name ?? ""}`.trim()}
                  >
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── negócios parados ─────────────────────────
interface StaleProps {
  accountId: string;
  userId: string | null;
  deals: MyDay["stale_deals"] | undefined;
  now: Date;
}

export function StaleDealsPanel({ accountId, userId, deals, now }: StaleProps) {
  const followUp = useFollowUpDeal(accountId);
  return (
    <section aria-labelledby="meu-dia-parados">
      <h2 id="meu-dia-parados" className="eyebrow">
        Clientes sem acompanhamento
      </h2>
      <p className="mt-1 mb-3 text-[12px] text-muted-foreground">
        Cartões da sua carteira sem movimento há mais de 7 dias e sem próximo passo marcado.
      </p>
      {!deals ? (
        <ListSkeleton />
      ) : deals.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Todos os clientes da sua carteira têm próximo passo.
        </p>
      ) : (
        <ul className="space-y-2">
          {deals.map((s) => {
            const pending = followUp.isPending && followUp.variables.dealId === s.id;
            return (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-3"
              >
                <Link
                  to="/crm"
                  search={{ negocio: s.id }}
                  className="min-w-0 flex-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <p className="truncate text-[14px] font-medium hover:underline">{s.title}</p>
                  <p className="truncate text-[12px] text-muted-foreground tabular-nums">
                    {(s.value ?? 0) > 0 ? `${formatMoney(s.value ?? 0, true)} · ` : ""}parado há{" "}
                    {daysSince(s.updated_at, now)} dias
                  </p>
                </Link>
                <button
                  type="button"
                  disabled={!userId || pending}
                  aria-label={`Criar tarefa para retomar ${s.title}`}
                  title="Criar tarefa para retomar"
                  onClick={() =>
                    userId &&
                    followUp.mutate(
                      { dealId: s.id, title: s.title, userId },
                      {
                        onSuccess: () => toast.success("Tarefa de retomada criada"),
                        onError: (e) => toast.error(errorMessage(e)),
                      },
                    )
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Undo2 className="size-3.5" aria-hidden />
                  )}
                  Retomar
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── leads aquecidos ─────────────────────────
interface LeadsProps {
  accountId: string;
  leads: MyDay["hot_unanswered"] | undefined;
}

export function HotLeadsSection({ accountId, leads }: LeadsProps) {
  // A RPC já ordena pela nota; reordenar aqui garante o contrato da tela.
  const sorted = [...(leads ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const extras = useLeadExtras(
    accountId,
    sorted.map((l) => l.conversation_id),
  );
  return (
    <section aria-labelledby="meu-dia-leads">
      <div className="flex items-center justify-between gap-2">
        <h2 id="meu-dia-leads" className="font-display text-[22px] font-medium">
          Clientes esperando resposta
        </h2>
        <Bot className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-1 mb-5 text-[13px] text-muted-foreground">
        Quem escreveu e ainda está sem a sua resposta. A IA põe na frente quem ela marcou como
        prioridade.
      </p>
      {!leads ? (
        <ListSkeleton />
      ) : sorted.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Ninguém esperando a sua resposta agora. Quando um cliente escrever e ficar sem retorno,
          ele aparece aqui.
        </p>
      ) : (
        <ul className="-mx-3 space-y-1">
          {sorted.map((h) => {
            const extra = extras.data?.get(h.conversation_id);
            const top = (h.score ?? 0) >= 80;
            return (
              <li key={h.conversation_id}>
                <Link
                  to="/inbox/$conversationId"
                  params={{ conversationId: h.conversation_id }}
                  className="row-wash group flex items-center gap-3 rounded-xl px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ContactAvatar
                    name={h.name}
                    src={extra?.avatarUrl ?? null}
                    platform={extra?.platform ?? null}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-[14px] font-medium">{h.name ?? "Sem nome"}</p>
                      {top && (
                        <span className="shrink-0 rounded-full bg-primary px-2 py-px text-[11px] font-medium text-primary-foreground">
                          prioridade
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {h.last_message_preview ?? "Sem prévia da mensagem"}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-[11px] text-subtle sm:block">
                    {formatRelative(h.last_inbound_at)}
                  </span>
                  <span className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                    Responder
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
