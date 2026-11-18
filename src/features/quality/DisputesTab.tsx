import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useTeamMembers } from "@/features/contacts/api";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useDisputes, useEvaluationsByIds, useQualityAction, type QualityDispute } from "./api";
import { EvaluationSheet } from "./EvaluationSheet";
import { ScoreBadge } from "./ScoreBadge";

const STATUS: Record<string, string> = {
  open: "Aguardando decisão",
  accepted: "Aceita",
  rejected: "Recusada",
};

// Contestações: o atendente pede revisão; o gestor decide e o atendente recebe a resposta.
export function DisputesTab({ accountId, isManager }: { accountId: string; isManager: boolean }) {
  const disputes = useDisputes(accountId);
  const team = useTeamMembers(accountId);
  const [open, setOpen] = useState<string | null>(null);
  const ids = (disputes.data ?? []).map((d) => d.evaluation_id);
  const evals = useEvaluationsByIds(accountId, ids);
  const evById = useMemo(() => new Map((evals.data ?? []).map((e) => [e.id, e])), [evals.data]);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );

  if (disputes.isPending) return <Skeleton className="h-60 w-full rounded-xl" />;
  if (disputes.isError)
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Não deu para carregar"
        description={errorMessage(disputes.error)}
      />
    );
  const list = [...(disputes.data ?? [])].sort(
    (a, b) => Number(b.status === "open") - Number(a.status === "open"),
  );
  if (list.length === 0)
    return (
      <EmptyState
        icon={MessageSquareWarning}
        title="Nenhuma contestação"
        description={
          isManager
            ? "Quando um atendente discordar da nota, o pedido de revisão aparece aqui para você decidir."
            : "Discorda de uma nota? Abra a nota em Notas e toque em Contestar."
        }
      />
    );

  return (
    <>
      <ul className="grid gap-3">
        {list.map((d) => {
          const ev = evById.get(d.evaluation_id);
          const criterion = ev?.items.find((i) => i.criterion_id === d.criterion_id)?.label;
          return (
            <li key={d.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {names.get(d.agent_user_id) ?? "Atendente"}
                </span>
                <span>· {formatRelative(d.created_at)}</span>
                <span>· {criterion ? `critério “${criterion}”` : "a nota inteira"}</span>
                <span className="ml-auto rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-medium text-foreground">
                  {STATUS[d.status]}
                </span>
                {ev && <ScoreBadge score={ev.score} eliminated={ev.eliminated} />}
              </div>
              <p className="mt-2 text-[13px] whitespace-pre-wrap">{d.reason}</p>
              {d.decision_note && (
                <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px]">
                  <span className="font-medium">Decisão:</span> {d.decision_note}
                  {d.new_score !== null &&
                    ` · nota corrigida para ${Math.round(Number(d.new_score))}`}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(d.evaluation_id)}>
                  Ver a nota
                </Button>
              </div>
              {isManager && d.status === "open" && (
                <DecideForm accountId={accountId} dispute={d} currentScore={ev?.score ?? null} />
              )}
            </li>
          );
        })}
      </ul>
      <EvaluationSheet
        accountId={accountId}
        evaluationId={open}
        agentName={open ? (names.get(evById.get(open)?.agent_user_id ?? "") ?? "Atendente") : ""}
        isManager={isManager}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

function DecideForm({
  accountId,
  dispute,
  currentScore,
}: {
  accountId: string;
  dispute: QualityDispute;
  currentScore: number | null;
}) {
  const decide = useQualityAction(accountId);
  const [note, setNote] = useState("");
  const [score, setScore] = useState(String(Math.round(currentScore ?? 0)));

  function send(decision: "accepted" | "rejected") {
    decide.mutate(
      {
        action: "dispute.decide",
        disputeId: dispute.id,
        decision,
        note,
        newScore: Number(score),
      },
      {
        onSuccess: () =>
          toast.success(decision === "accepted" ? "Nota corrigida" : "Contestação recusada"),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="mt-3 grid gap-2 rounded-xl bg-surface-2/60 p-3">
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Explique a decisão para o atendente"
        aria-label="Decisão"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12px]">
          Nota corrigida
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="h-8 w-20"
            aria-label="Nota corrigida"
          />
        </label>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => send("rejected")}
            disabled={decide.isPending || !note.trim()}
          >
            Manter a nota
          </Button>
          <Button
            size="sm"
            onClick={() => send("accepted")}
            disabled={decide.isPending || !note.trim()}
          >
            {decide.isPending && <Loader2 className="animate-spin" />} Aceitar e corrigir
          </Button>
        </div>
      </div>
    </div>
  );
}
