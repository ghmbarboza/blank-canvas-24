import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { History, Square, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useAutomationAction, useAutomationLogs, useAutomationRuns, type Automation } from "./api";
import { EXIT_LABEL, NODE_LABEL, type NodeType } from "./engine";
import { EnrollDialog } from "./EnrollDialog";

const RUN_STATUS: Record<string, string> = {
  running: "Andando",
  waiting: "Esperando",
  paused: "Pausado",
  done: "Concluiu",
  exited: "Saiu",
  failed: "Falhou",
};
const LOG_TONE: Record<string, string> = {
  ok: "text-foreground",
  skipped: "text-muted-foreground",
  deferred: "text-muted-foreground",
  failed: "text-danger",
  exited: "text-muted-foreground",
  entered: "text-primary",
};

export function RunsPanel({
  accountId,
  automation,
}: {
  accountId: string;
  automation: Automation;
}) {
  const runs = useAutomationRuns(automation.id);
  const logs = useAutomationLogs(automation.id);
  const action = useAutomationAction(accountId);
  const [enrolling, setEnrolling] = useState(false);
  const list = runs.data ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-[24px] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Inscritos ({list.length})</p>
          <Button
            size="sm"
            variant="outline"
            disabled={automation.status !== "active"}
            title={automation.status !== "active" ? "Ative a automação para inscrever" : undefined}
            onClick={() => setEnrolling(true)}
          >
            <Users /> Inscrever contatos
          </Button>
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Ninguém inscrito ainda"
            description="Os contatos entram pelo gatilho ou pela inscrição manual (lista de clientes, segmento ou cartão da carteira)."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((r) => {
              const c = r.contacts as unknown as {
                name: string | null;
                phone: string | null;
              } | null;
              const node = r.current_node ? automation.graph.nodes[r.current_node] : null;
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/contatos/$contactId"
                      params={{ contactId: r.contact_id }}
                      className="truncate text-[13px] font-medium hover:underline"
                    >
                      {c?.name ?? c?.phone ?? "Contato"}
                    </Link>
                    <p className="truncate text-[11px] text-subtle">
                      {RUN_STATUS[r.status]}
                      {r.status === "exited" &&
                        r.exit_reason &&
                        `: ${EXIT_LABEL[r.exit_reason as keyof typeof EXIT_LABEL] ?? r.exit_reason}`}
                      {["running", "waiting"].includes(r.status) &&
                        node &&
                        ` · em "${NODE_LABEL[node.type as NodeType]}"`}
                      {r.status === "waiting" && r.next_at && ` até ${formatDateTime(r.next_at)}`}
                      {` · entrou ${formatRelative(r.enrolled_at)} (${r.source})`}
                    </p>
                  </div>
                  {["running", "waiting", "paused"].includes(r.status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        action.mutate(
                          { action: "stop_run", automationId: automation.id, runId: r.id },
                          {
                            onSuccess: () => toast.success("Contato tirado da automação"),
                            onError: (e) => toast.error(errorMessage(e)),
                          },
                        )
                      }
                    >
                      <Square /> Tirar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="rounded-[24px] border border-border bg-surface p-5">
        <p className="eyebrow mb-3">Histórico de passos</p>
        {(logs.data ?? []).length === 0 ? (
          <EmptyState
            icon={History}
            title="Sem histórico"
            description="Cada passo executado aparece aqui, com o motivo quando foi pulado."
            className="py-10"
          />
        ) : (
          <ol className="space-y-2">
            {(logs.data ?? []).map((l) => (
              <li key={l.id} className="rounded-xl bg-surface-2/50 px-3 py-2">
                <p className={cn("text-[12px] font-medium", LOG_TONE[l.status])}>{l.message}</p>
                <p className="text-[11px] text-subtle">
                  {(l.contacts as unknown as { name: string | null } | null)?.name ?? "—"}
                  {l.node_type && ` · ${NODE_LABEL[l.node_type as NodeType] ?? l.node_type}`} ·{" "}
                  {formatRelative(l.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <EnrollDialog
        accountId={accountId}
        open={enrolling}
        onOpenChange={setEnrolling}
        fixedAutomationId={automation.id}
      />
    </div>
  );
}
