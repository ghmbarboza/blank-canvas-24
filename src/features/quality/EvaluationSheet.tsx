import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2, MessageSquareWarning, Quote, RotateCcw, X } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useDisputes, useEvaluation, useQualityAction, type EvaluateResult } from "./api";
import { ScoreBadge } from "./ScoreBadge";
import { CHANNEL_LABEL, type QualityChannel } from "./scoring";

const DISPUTE_STATUS: Record<string, string> = {
  open: "Contestação em análise",
  accepted: "Contestação aceita",
  rejected: "Contestação recusada",
};

// Detalhe da nota: critério a critério, com o trecho como prova; o atendente contesta daqui.
export function EvaluationSheet({
  accountId,
  evaluationId,
  agentName,
  isManager,
  onClose,
}: {
  accountId: string;
  evaluationId: string | null;
  agentName: string;
  isManager: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const ev = useEvaluation(accountId, evaluationId);
  const disputes = useDisputes(accountId);
  const action = useQualityAction<EvaluateResult>(accountId);
  const [contesting, setContesting] = useState(false);
  const [criterion, setCriterion] = useState("all");
  const [reason, setReason] = useState("");
  const e = ev.data;
  const dispute = (disputes.data ?? []).find((d) => d.evaluation_id === evaluationId);
  const isMine = Boolean(e && user && e.agent_user_id === user.id);

  function retry() {
    if (!e) return;
    action.mutate(
      { action: "evaluation.retry", evaluationId: e.id },
      {
        onSuccess: (r) =>
          r.status === "done"
            ? toast.success("Avaliação refeita")
            : toast.error(r.reason ?? "Não deu para avaliar"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  function contest() {
    if (!e) return;
    action.mutate(
      {
        action: "dispute.open",
        evaluationId: e.id,
        criterionId: criterion === "all" ? null : criterion,
        reason,
      },
      {
        onSuccess: () => {
          toast.success("Contestação enviada ao gestor");
          setContesting(false);
          setReason("");
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <Sheet open={Boolean(evaluationId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {!e ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="atmosphere border-b border-border px-6 py-5 text-left">
              <p className="text-[12px] text-subtle">
                {CHANNEL_LABEL[e.channel as QualityChannel]} · {e.form_name ?? "Formulário"} ·{" "}
                {formatDateTime(e.created_at)}
              </p>
              <SheetTitle className="flex items-center gap-3 font-display text-[20px]">
                {agentName}
                <ScoreBadge score={e.score} eliminated={e.eliminated} />
                {e.revised && (
                  <span className="rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-medium">
                    Revisada
                  </span>
                )}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-3 text-[12px]">
                {e.source === "conversation" ? (
                  <Link
                    to="/inbox/$conversationId"
                    params={{ conversationId: e.source_id }}
                    className="underline-offset-2 hover:underline"
                  >
                    Abrir a conversa
                  </Link>
                ) : (
                  <Link
                    to="/ligacoes"
                    search={{ chamada: e.source_id }}
                    className="underline-offset-2 hover:underline"
                  >
                    Abrir a ligação
                  </Link>
                )}
                {dispute && <span>{DISPUTE_STATUS[dispute.status]}</span>}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {e.status !== "done" ? (
                <div className="rounded-xl border border-border bg-surface-2 p-4 text-[13px]">
                  <p className="font-medium">
                    {e.status === "error" ? "A IA não conseguiu avaliar" : "Avaliação pulada"}
                  </p>
                  <p className="mt-1 text-muted-foreground">{e.error ?? "Sem detalhe"}</p>
                </div>
              ) : (
                <>
                  {e.summary && (
                    <p className="mb-5 rounded-xl bg-surface-2/70 p-4 text-[13px] leading-relaxed">
                      {e.summary}
                    </p>
                  )}
                  <ol className="space-y-3">
                    {e.items.map((i) => (
                      <li
                        key={i.criterion_id}
                        className={cn(
                          "rounded-xl border p-4",
                          i.eliminatory && !i.passed
                            ? "border-danger/40 bg-danger/5"
                            : "border-border bg-surface",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {i.passed ? (
                            <Check
                              className="mt-0.5 size-4 shrink-0 text-foreground"
                              aria-label="Cumpriu"
                            />
                          ) : (
                            <X
                              className="mt-0.5 size-4 shrink-0 text-danger"
                              aria-label="Não cumpriu"
                            />
                          )}
                          <p className="min-w-0 flex-1 text-[13px] font-medium">
                            {i.label}
                            {i.eliminatory && (
                              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                obrigatório
                              </span>
                            )}
                          </p>
                          {!i.eliminatory && (
                            <span className="text-[12px] text-muted-foreground tabular-nums">
                              {i.score}
                            </span>
                          )}
                        </div>
                        {i.comment && (
                          <p className="mt-1 pl-6 text-[12px] text-muted-foreground">{i.comment}</p>
                        )}
                        {i.evidence && (
                          <blockquote className="mt-2 ml-6 flex gap-2 rounded-lg bg-note px-3 py-2 text-[12px] text-note-fg">
                            <Quote className="mt-0.5 size-3 shrink-0" aria-hidden />
                            <span>{i.evidence}</span>
                          </blockquote>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {dispute && dispute.status !== "open" && dispute.decision_note && (
                <div className="mt-5 rounded-xl border border-border bg-surface p-4 text-[13px]">
                  <p className="eyebrow mb-1">Decisão do gestor</p>
                  <p>{dispute.decision_note}</p>
                </div>
              )}

              {contesting && (
                <div className="mt-5 grid gap-3 rounded-xl border border-border bg-surface p-4">
                  <div className="grid gap-1">
                    <Label className="text-[12px]">Qual ponto está errado?</Label>
                    <Select value={criterion} onValueChange={setCriterion}>
                      <SelectTrigger className="h-9" aria-label="Critério contestado">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">A nota inteira</SelectItem>
                        {e.items.map((i) => (
                          <SelectItem key={i.criterion_id} value={i.criterion_id}>
                            {i.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[12px]" htmlFor="dispute-reason">
                      Explique para o gestor
                    </Label>
                    <Textarea
                      id="dispute-reason"
                      rows={3}
                      value={reason}
                      onChange={(ev2) => setReason(ev2.target.value)}
                      placeholder="Ex.: eu ofereci o prazo certo, está na mensagem das 10h"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setContesting(false)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={contest}
                      disabled={action.isPending || reason.trim().length < 3}
                    >
                      {action.isPending && <Loader2 className="animate-spin" />} Enviar contestação
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-background px-6 py-3">
              {isManager && (
                <Button variant="outline" size="sm" onClick={retry} disabled={action.isPending}>
                  {action.isPending && action.variables?.action === "evaluation.retry" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RotateCcw />
                  )}
                  Avaliar de novo
                </Button>
              )}
              {isMine && e.status === "done" && !dispute && !contesting && (
                <Button size="sm" onClick={() => setContesting(true)}>
                  <MessageSquareWarning /> Contestar a nota
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
