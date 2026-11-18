import { useMemo, useState } from "react";
import { AlertTriangle, Bot, ClipboardCheck } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamMembers } from "@/features/contacts/api";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useEvaluations, type EvaluationFilters, type QualityEvaluation } from "./api";
import { EvaluationSheet } from "./EvaluationSheet";
import { ScoreBadge } from "./ScoreBadge";
import { CHANNEL_LABEL, type QualityChannel } from "./scoring";

export function EvaluationsTab({
  accountId,
  isManager,
}: {
  accountId: string;
  isManager: boolean;
}) {
  const team = useTeamMembers(accountId);
  const [filters, setFilters] = useState<EvaluationFilters>({
    channel: "all",
    agent: "all",
    status: "done",
    days: 30,
  });
  const [open, setOpen] = useState<string | null>(null);
  const list = useEvaluations(accountId, filters);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const nameOf = (e: QualityEvaluation) =>
    e.is_ai
      ? "Agente de IA"
      : e.agent_user_id
        ? (names.get(e.agent_user_id) ?? "Atendente")
        : "Sem responsável";
  const current = (list.data ?? []).find((e) => e.id === open);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Select
          value={filters.channel}
          onValueChange={(v) =>
            setFilters({ ...filters, channel: v as EvaluationFilters["channel"] })
          }
        >
          <SelectTrigger className="h-9 w-40" aria-label="Canal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            {(["call", "chat", "email"] as QualityChannel[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isManager && (
          <Select value={filters.agent} onValueChange={(v) => setFilters({ ...filters, agent: v })}>
            <SelectTrigger className="h-9 w-48" aria-label="Atendente">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda a equipe</SelectItem>
              <SelectItem value="ai">Agentes de IA</SelectItem>
              {(team.data ?? []).map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={filters.status}
          onValueChange={(v) =>
            setFilters({ ...filters, status: v as EvaluationFilters["status"] })
          }
        >
          <SelectTrigger className="h-9 w-44" aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="done">Com nota</SelectItem>
            <SelectItem value="eliminated">Só eliminadas</SelectItem>
            <SelectItem value="problem">Puladas ou com erro</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(filters.days)}
          onValueChange={(v) => setFilters({ ...filters, days: Number(v) })}
        >
          <SelectTrigger className="h-9 w-36" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isPending ? (
        <Skeleton className="h-60 w-full rounded-xl" />
      ) : list.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Não deu para carregar"
          description={errorMessage(list.error)}
        />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhuma nota com esses filtros"
          description={
            isManager
              ? "Amplie o período ou troque o filtro. As interações são avaliadas quando terminam."
              : "Quando suas conversas e ligações terminarem, a nota aparece aqui com o motivo."
          }
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {(list.data ?? []).map((e) => (
            <li key={e.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(e.id)}
                data-selected={open === e.id}
                className="row-wash flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {e.is_ai && <Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{nameOf(e)}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {CHANNEL_LABEL[e.channel as QualityChannel]} ·{" "}
                    {e.status === "done" ? (e.summary ?? e.form_name) : (e.error ?? "sem detalhe")}
                  </p>
                </div>
                <span className="hidden shrink-0 text-[11px] text-subtle sm:block">
                  {formatRelative(e.created_at)}
                </span>
                {e.status === "done" ? (
                  <ScoreBadge score={e.score} eliminated={e.eliminated} />
                ) : (
                  <span className="rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-medium">
                    {e.status === "error" ? "Erro" : "Pulada"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <EvaluationSheet
        accountId={accountId}
        evaluationId={open}
        agentName={current ? nameOf(current) : ""}
        isManager={isManager}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
