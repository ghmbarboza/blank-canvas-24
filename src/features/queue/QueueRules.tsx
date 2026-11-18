import { useState } from "react";
import { ArrowRight, ListOrdered, Plus } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCallCenterTeam, useQueues, type Queue, type TeamRow } from "./api";
import { QueueForm } from "./QueuesPanel";
import { queueMembers, queueSentence } from "./routing-copy";

function RuleCard({
  queue: q,
  team,
  onEdit,
}: {
  queue: Queue;
  team: TeamRow[];
  onEdit: () => void;
}) {
  const members = queueMembers(q, team);
  const shown = members.slice(0, 4);
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface p-6 md:p-7",
        !q.is_active && "bg-surface/60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          q.is_active ? "bg-primary" : "bg-border-strong",
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[16px] font-medium">{q.name}</h3>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", q.is_active ? "bg-success" : "bg-border-strong")}
            aria-hidden
          />
          {q.is_active ? "Ativa" : "Desligada"}
        </span>
      </div>
      <p
        className={cn(
          "mt-4 text-[17px] leading-[1.6] md:text-[19px]",
          q.is_active ? "text-foreground/85" : "text-muted-foreground",
        )}
      >
        {queueSentence(q).map((s, i) =>
          s.strong ? (
            <strong key={i} className="font-semibold text-foreground">
              {s.text}
            </strong>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex min-w-0 items-center gap-2">
          {members.length === 0 ? (
            <span className="text-[12px] text-danger">
              Ninguém da equipe atende esta fila. Ajuste as habilidades ao lado.
            </span>
          ) : (
            <>
              <span className="flex -space-x-2" aria-hidden>
                {shown.map((m) => (
                  <span
                    key={m.userId}
                    className="grid size-7 place-items-center rounded-full border-2 border-surface bg-surface-3 text-[10px] font-semibold"
                  >
                    {initials(m.name)}
                  </span>
                ))}
                {members.length > shown.length && (
                  <span className="grid size-7 place-items-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-muted-foreground">
                    +{members.length - shown.length}
                  </span>
                )}
              </span>
              <span className="truncate text-[12px] text-muted-foreground">
                {members.length} {members.length === 1 ? "pessoa atende" : "pessoas atendem"}
              </span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Editar a regra ${q.name}`}
          className="shrink-0"
        >
          Editar regra <ArrowRight />
        </Button>
      </div>
    </article>
  );
}

// Coluna "Regras de distribuição": cada fila lida como uma frase, com quem atende e a edição no lugar.
export function QueueRules({ accountId }: { accountId: string }) {
  const queues = useQueues(accountId);
  const team = useCallCenterTeam(accountId);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const list = queues.data ?? [];

  return (
    <section aria-labelledby="fila-regras">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <h2 id="fila-regras" className="font-display text-[20px] font-medium">
          Regras de distribuição
        </h2>
        {list.length > 0 && editing !== "new" && (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <Plus /> Nova regra
          </Button>
        )}
      </div>
      <div className="mt-6 grid gap-5">
        {queues.isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : queues.isError ? (
          <p className="text-[13px] text-danger">{errorMessage(queues.error)}</p>
        ) : (
          <>
            {editing === "new" && (
              <QueueForm accountId={accountId} onDone={() => setEditing(null)} />
            )}
            {list.length === 0 && editing !== "new" && (
              <EmptyState
                icon={ListOrdered}
                title="Nenhuma regra ainda"
                description="Crie uma regra para cada tipo de atendimento (ex.: Suporte e Vendas). Sem regra, tudo entra na fila geral e vai para qualquer pessoa livre."
                action={
                  <Button onClick={() => setEditing("new")}>
                    <Plus /> Criar a primeira regra
                  </Button>
                }
                className="rounded-xl border border-dashed border-border bg-surface"
              />
            )}
            {list.map((q) =>
              editing === q.id ? (
                <QueueForm
                  key={q.id}
                  queue={q}
                  accountId={accountId}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <RuleCard
                  key={q.id}
                  queue={q}
                  team={team.data ?? []}
                  onEdit={() => setEditing(q.id)}
                />
              ),
            )}
          </>
        )}
      </div>
    </section>
  );
}
