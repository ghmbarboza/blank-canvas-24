import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import {
  agentKeys,
  agentsApi,
  useAgentEvals,
  useDeleteEval,
  useEstimate,
  useSaveEval,
  type Agent,
  type EvalRun,
} from "./api";
import { PassBar, Pill } from "./ui";
import { usd } from "./ui-format";

const KIND: Record<string, string> = {
  knowledge: "Base",
  conversation: "Conversa real",
  custom: "Caso da empresa",
  tool_failure: "Ferramenta falhando",
  out_of_scope: "Fora do escopo",
  jailbreak: "Tentativa de burlar",
  handoff: "Pedir humano",
};

interface ResultRow {
  case_id: string;
  kind: string;
  question: string;
  reply: string;
  action: string;
  passed: boolean;
  reason: string;
}

// Avaliação obrigatória: suíte de perguntas reais, custo antes de rodar e resultado caso a caso.
export function AgentEvalPanel({
  accountId,
  agent,
  runs,
}: {
  accountId: string;
  agent: Agent;
  runs: EvalRun[];
}) {
  const { isManager } = useAccount();
  const qc = useQueryClient();
  const evals = useAgentEvals(accountId, agent.id);
  const save = useSaveEval(accountId, agent.id);
  const del = useDeleteEval(accountId, agent.id);
  const [confirm, setConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState({ question: "", expected: "", must_handoff: false });
  const latest = runs[0];
  const running = latest && (latest.status === "queued" || latest.status === "running");
  const results = (Array.isArray(latest?.results) ? latest.results : []) as unknown as ResultRow[];
  const cases = evals.data ?? [];

  if (agent.role === "supervisor")
    return (
      <p className="pt-6 text-[13px] text-muted-foreground">
        O supervisor não conversa com cliente: ele lê a fila e avisa o gestor. Não precisa de
        avaliação.
      </p>
    );

  async function regenerate() {
    setGenerating(true);
    try {
      const r = await agentsApi<{ cases: number; fromKb: number; fromConversations: number }>(
        accountId,
        "suite.generate",
        { agentId: agent.id },
      );
      await qc.invalidateQueries({ queryKey: agentKeys.evals(accountId, agent.id) });
      await qc.invalidateQueries({ queryKey: agentKeys.estimate(accountId, agent.id) });
      toast.success(
        `${r.cases} perguntas: ${r.fromKb} artigos da base e ${r.fromConversations} perguntas reais de clientes`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <section aria-labelledby="ev-last" className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="ev-last" className="text-[14px] font-medium">
            {running
              ? `Avaliando: ${results.length} de ${latest.total}`
              : latest?.status === "done"
                ? `Última avaliação: ${Math.round((latest.pass_rate ?? 0) * 100)}% (${latest.passed} de ${latest.total})`
                : latest?.status === "error"
                  ? "A última avaliação parou"
                  : "Ainda não avaliado"}
          </h3>
          {isManager && (
            <Button
              size="sm"
              disabled={!!running || cases.length === 0}
              onClick={() => setConfirm(true)}
            >
              {running ? <Loader2 className="animate-spin" /> : <FlaskConical />} Rodar avaliação
            </Button>
          )}
        </div>
        {latest && (
          <div className="mt-3">
            <PassBar
              rate={
                latest.status === "done"
                  ? latest.pass_rate
                  : results.length
                    ? results.filter((r) => r.passed).length / Math.max(1, latest.total)
                    : 0
              }
            />
            <p className="mt-2 text-[12px] text-subtle">
              {latest.status === "error" && latest.error ? `${latest.error}. ` : ""}
              Versão {latest.agent_version}
              {latest.agent_version !== agent.version && " (o agente mudou depois: rode de novo)"} ·
              custo {usd(latest.cost_usd)} · {formatRelative(latest.created_at)} · precisa de 90%
              para ligar
            </p>
          </div>
        )}
        {results.length > 0 && (
          <ul className="mt-4 divide-y divide-border">
            {results.map((r) => (
              <li key={r.case_id} className="flex gap-3 py-2.5">
                {r.passed ? (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-foreground"
                    aria-label="Passou"
                  />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Falhou" />
                )}
                <div className="min-w-0 text-[13px]">
                  <p className="font-medium">{r.question}</p>
                  <p className="text-muted-foreground">
                    {r.action === "handoff"
                      ? "Passou para a equipe: "
                      : r.action === "route"
                        ? "Passou para outro agente. "
                        : ""}
                    {r.reply}
                  </p>
                  <p className="text-[12px] text-subtle">{r.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ev-suite">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 id="ev-suite" className="eyebrow">
            Perguntas da suíte ({cases.length})
          </h3>
          {isManager && (
            <Button
              size="sm"
              variant="ghost"
              disabled={generating}
              onClick={() => void regenerate()}
            >
              {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Gerar de novo
            </Button>
          )}
        </div>
        {evals.isPending ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : cases.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
            Sem perguntas ainda. Clique em Gerar de novo: elas saem da sua base de conhecimento e
            das conversas reais.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {cases.map((c) => (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <Pill>
                      {KIND[c.source === "conversation" ? "conversation" : c.kind] ?? c.kind}
                    </Pill>
                    {c.fail_tool && <Pill>falha: {c.fail_tool}</Pill>}
                  </div>
                  <p className="font-medium">{c.question}</p>
                  <p className="text-[12px] text-subtle">
                    Passa se: {c.must_handoff ? "passar para humano" : c.expected}
                  </p>
                </div>
                {isManager && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Apagar pergunta"
                    onClick={() =>
                      del.mutate(c.id, { onError: (e) => toast.error(errorMessage(e)) })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isManager && (
          <form
            className="mt-3 space-y-2 rounded-xl border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.question.trim() || (!draft.expected.trim() && !draft.must_handoff)) {
                toast.error("Escreva a pergunta e o que a resposta precisa ter");
                return;
              }
              save.mutate(draft, {
                onSuccess: () => setDraft({ question: "", expected: "", must_handoff: false }),
                onError: (er) => toast.error(errorMessage(er)),
              });
            }}
          >
            <p className="text-[13px] font-medium">Acrescentar uma pergunta sua</p>
            <Input
              placeholder="O que o cliente pergunta"
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            />
            <Textarea
              rows={2}
              placeholder="O que a resposta precisa ter (e o que não pode)"
              value={draft.expected}
              onChange={(e) => setDraft({ ...draft, expected: e.target.value })}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  checked={draft.must_handoff}
                  onCheckedChange={(v) => setDraft({ ...draft, must_handoff: v === true })}
                />
                Tem que passar para humano
              </label>
              <Button size="sm" type="submit" disabled={save.isPending}>
                <Plus /> Acrescentar
              </Button>
            </div>
          </form>
        )}
      </section>
      <ConfirmRun
        accountId={accountId}
        agent={agent}
        open={confirm}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}

function ConfirmRun({
  accountId,
  agent,
  open,
  onClose,
}: {
  accountId: string;
  agent: Agent;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const est = useEstimate(accountId, agent.id, open);
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const e = est.data;

  async function start() {
    setBusy(true);
    try {
      await agentsApi(accountId, "eval.start", { agentId: agent.id, confirmCost: true, activate });
      await qc.invalidateQueries({ queryKey: agentKeys.runs(accountId, agent.id) });
      toast.success("Avaliação começou. Leva alguns minutos; você recebe um aviso no fim.");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rodar a avaliação de {agent.name}</DialogTitle>
          <DialogDescription>
            O agente responde cada pergunta da suíte e um avaliador confere pelo critério. Nada é
            enviado a cliente.
          </DialogDescription>
        </DialogHeader>
        {est.isPending ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : est.isError ? (
          <p className="text-[13px] text-danger">{errorMessage(est.error)}</p>
        ) : (
          e && (
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-xl bg-surface-2 p-3">
                <dt className="text-muted-foreground">Custo estimado</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">{usd(e.usd)}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <dt className="text-muted-foreground">Perguntas</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">{e.cases}</dd>
              </div>
              <p className="col-span-2 text-[12px] text-subtle">
                Cerca de {e.calls} chamadas ao modelo {e.model},{" "}
                {e.usesAccountKey ? "cobradas na chave de IA da sua empresa" : "pela IA inclusa"}.
              </p>
            </dl>
          )
        )}
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={activate} onCheckedChange={(v) => setActivate(v === true)} />
          Ligar o agente sozinho se passar com 90% ou mais
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !e?.cases} onClick={() => void start()}>
            {busy && <Loader2 className="animate-spin" />} Rodar por {e ? usd(e.usd) : "…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
