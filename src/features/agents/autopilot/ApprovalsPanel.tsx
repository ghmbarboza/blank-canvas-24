// Fila de aprovações do piloto automático: o que a IA quer fazer e está esperando o gestor.
// Aprovar retoma a rodada de onde parou e o cliente recebe a resposta; recusar faz a IA
// seguir sem a ação. Some quando não há nada pendente.
import { Link } from "@tanstack/react-router";
import { Check, Hand, Loader2, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { usePendingApprovals, useDecideApproval } from "./api";

type Props = { accountId: string; where: "painel" | "equipe"; className?: string };

export function ApprovalsPanel({ accountId, where, className }: Props) {
  const { isManager } = useAccount();
  const pending = usePendingApprovals(accountId, where);
  const decide = useDecideApproval(accountId);
  const list = pending.data ?? [];
  if (!isManager || !list.length) return null;

  function run(approvalId: string, decision: "approve" | "reject") {
    decide.mutate(
      { approvalId, decision },
      {
        onSuccess: (r) =>
          toast.success(
            decision === "approve" ? "Aprovado. O cliente já recebeu a resposta." : "Recusado.",
            {
              description: r.reply.slice(0, 160),
            },
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <section
      aria-label="Esperando a sua aprovação"
      className={cn(
        "rounded-[22px] border border-primary-line bg-primary-soft p-4 md:p-5",
        className,
      )}
    >
      <header className="mb-3 flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-surface text-foreground">
          <Hand className="size-4" />
        </span>
        <div>
          <h2 className="text-[15px] font-medium leading-tight">
            {list.length === 1 ? "1 ação esperando você" : `${list.length} ações esperando você`}
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            O piloto automático parou antes de fazer. O cliente já foi avisado que vocês estão
            conferindo.
          </p>
        </div>
      </header>
      <ul className="grid gap-2">
        {list.map((a) => {
          const busy = decide.isPending && decide.variables?.approvalId === a.id;
          return (
            <li
              key={a.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium leading-snug">{a.summary || a.tool}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                  <span>{a.ai_agents?.name ?? "Agente de IA"}</span>
                  <span aria-hidden>·</span>
                  <span>{formatRelative(a.created_at)}</span>
                  {a.conversation_id ? (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        to="/inbox/$conversationId"
                        params={{ conversationId: a.conversation_id }}
                        className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
                      >
                        <MessageSquare className="size-3" /> ver conversa
                      </Link>
                    </>
                  ) : (
                    <>
                      <span aria-hidden>·</span>
                      <span>simulação</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => run(a.id, "reject")}
                  aria-label={`Recusar: ${a.summary}`}
                >
                  <X className="size-3.5" /> Recusar
                </Button>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => run(a.id, "approve")}
                  aria-label={`Aprovar: ${a.summary}`}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}{" "}
                  Aprovar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
