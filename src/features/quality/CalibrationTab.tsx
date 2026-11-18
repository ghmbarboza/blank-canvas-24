import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Dice5, Loader2, Quote, Scale, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useTeamMembers } from "@/features/contacts/api";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useCalibrations,
  useEvaluationsByIds,
  useQualityAction,
  type QualityEvaluation,
} from "./api";
import { ScoreBadge } from "./ScoreBadge";
import { AGREEMENT_TOLERANCE, CHANNEL_LABEL, type QualityChannel } from "./scoring";

type Mine = Record<string, { score: number; passed: boolean }>;

// Calibração: o gestor reavalia uma amostra sorteada e vê quanto concorda com a IA.
export function CalibrationTab({ accountId }: { accountId: string }) {
  const [ids, setIds] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const sample = useQualityAction<{ ids: string[] }>(accountId);
  const evals = useEvaluationsByIds(accountId, ids);
  const history = useCalibrations(accountId, true);
  const current = (evals.data ?? [])[idx] ?? null;

  function draw() {
    sample.mutate(
      { action: "calibration.sample", size: 5 },
      {
        onSuccess: (r) => {
          setIds(r.ids);
          setIdx(0);
          if (r.ids.length === 0)
            toast.info("Não há avaliação nova para calibrar nos últimos 30 dias");
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  const avg =
    (history.data ?? []).length > 0
      ? (history.data ?? []).reduce((s, c) => s + Number(c.agreement ?? 0), 0) /
        (history.data ?? []).length
      : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-4">
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <Scale className="size-5 text-primary" aria-hidden />
          <p className="min-w-0 flex-1 text-[13px]">
            Reavalie 5 interações sorteadas sem olhar a nota da IA primeiro. A concordância mostra
            se dá para confiar na avaliação automática.
          </p>
          <Button onClick={draw} disabled={sample.isPending}>
            {sample.isPending ? <Loader2 className="animate-spin" /> : <Dice5 />} Sortear amostra
          </Button>
        </section>
        {ids.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="Nenhuma amostra em andamento"
            description="Sorteie uma amostra para começar. Uma calibração por semana já mantém a régua afinada."
          />
        ) : evals.isPending ? (
          <Skeleton className="h-72 w-full rounded-xl" />
        ) : !current ? (
          <EmptyState
            icon={Check}
            title="Amostra concluída"
            description="Obrigado. A concordância já entrou no painel de qualidade."
            action={<Button onClick={draw}>Sortear outra</Button>}
          />
        ) : (
          <CalibrationCard
            key={current.id}
            accountId={accountId}
            evaluation={current}
            position={`${idx + 1} de ${ids.length}`}
            onDone={() => setIdx((i) => i + 1)}
          />
        )}
      </div>
      <aside className="grid content-start gap-3">
        <div className="rounded-xl bg-primary p-5 text-primary-foreground">
          <p className="eyebrow opacity-70">Concordância com a IA</p>
          <p className="mt-1 font-display text-5xl font-semibold tabular-nums">
            {avg === null ? "—" : `${Math.round(avg)}%`}
          </p>
          <p className="mt-1 text-[12px] opacity-80">
            Critério concorda quando o veredito é o mesmo e a nota fica a até {AGREEMENT_TOLERANCE}{" "}
            pontos.
          </p>
        </div>
        <ul className="rounded-xl border border-border bg-surface p-2">
          {(history.data ?? []).slice(0, 12).map((c) => (
            <li key={c.id} className="flex items-center justify-between px-2 py-1.5 text-[12px]">
              <span className="text-muted-foreground">{formatRelative(c.created_at)}</span>
              <span className="font-medium tabular-nums">
                {Math.round(Number(c.agreement ?? 0))}%
              </span>
            </li>
          ))}
          {(history.data ?? []).length === 0 && (
            <li className="px-2 py-3 text-[12px] text-muted-foreground">
              Nenhuma calibração ainda.
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
}

function CalibrationCard({
  accountId,
  evaluation: e,
  position,
  onDone,
}: {
  accountId: string;
  evaluation: QualityEvaluation;
  position: string;
  onDone: () => void;
}) {
  const team = useTeamMembers(accountId);
  const save = useQualityAction<{ agreement: number; score: number }>(accountId);
  const [revealed, setRevealed] = useState(false);
  const [notes, setNotes] = useState("");
  const [mine, setMine] = useState<Mine>(() =>
    Object.fromEntries(e.items.map((i) => [i.criterion_id, { score: 80, passed: true }])),
  );
  const agent = useMemo(
    () =>
      e.is_ai
        ? "Agente de IA"
        : ((team.data ?? []).find((m) => m.userId === e.agent_user_id)?.name ?? "Atendente"),
    [team.data, e],
  );

  function submit() {
    save.mutate(
      {
        action: "calibration.save",
        evaluationId: e.id,
        items: e.items.map((i) => ({ criterion_id: i.criterion_id, ...mine[i.criterion_id] })),
        notes,
      },
      {
        onSuccess: (r) => {
          toast.success(`Concordância nesta interação: ${Math.round(r.agreement)}%`);
          onDone();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-subtle">
            {position} · {CHANNEL_LABEL[e.channel as QualityChannel]}
          </p>
          <p className="text-[14px] font-semibold">{agent}</p>
        </div>
        {e.source === "conversation" ? (
          <Link
            to="/inbox/$conversationId"
            params={{ conversationId: e.source_id }}
            target="_blank"
            className="text-[12px] underline-offset-2 hover:underline"
          >
            Ler a conversa
          </Link>
        ) : (
          <Link
            to="/ligacoes"
            search={{ chamada: e.source_id }}
            target="_blank"
            className="text-[12px] underline-offset-2 hover:underline"
          >
            Ouvir a ligação
          </Link>
        )}
        <Button variant="outline" size="sm" onClick={() => setRevealed((v) => !v)}>
          {revealed ? "Esconder a IA" : "Ver nota da IA"}
        </Button>
      </header>
      <ol className="divide-y divide-border">
        {e.items.map((i) => {
          const m = mine[i.criterion_id] ?? { score: 80, passed: true };
          const set = (patch: Partial<typeof m>) =>
            setMine({ ...mine, [i.criterion_id]: { ...m, ...patch } });
          return (
            <li key={i.criterion_id} className="grid gap-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-[13px] font-medium">{i.label}</p>
                <div className="flex gap-1" role="group" aria-label={`Veredito para ${i.label}`}>
                  <button
                    type="button"
                    onClick={() => set({ passed: true, score: Math.max(m.score, 70) })}
                    aria-pressed={m.passed}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px]",
                      m.passed
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-2 text-muted-foreground",
                    )}
                  >
                    <Check className="size-3" /> Cumpriu
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ passed: false, score: Math.min(m.score, 60) })}
                    aria-pressed={!m.passed}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px]",
                      !m.passed ? "bg-danger text-white" : "bg-surface-2 text-muted-foreground",
                    )}
                  >
                    <X className="size-3" /> Não cumpriu
                  </button>
                </div>
                {!i.eliminatory && (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={m.score}
                    onChange={(ev) =>
                      set({ score: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) })
                    }
                    className="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-[13px] tabular-nums"
                    aria-label={`Sua nota para ${i.label}`}
                  />
                )}
              </div>
              {revealed && (
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <span>IA:</span>
                  <ScoreBadge score={i.eliminatory ? (i.passed ? 100 : 0) : i.score} />
                  {i.evidence && (
                    <span className="inline-flex min-w-0 items-start gap-1 rounded-lg bg-note px-2 py-1 text-note-fg">
                      <Quote className="mt-0.5 size-3 shrink-0" aria-hidden /> {i.evidence}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <footer className="grid gap-2 border-t border-border px-5 py-4">
        <Textarea
          rows={2}
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          placeholder="Observação para a equipe (opcional)"
          aria-label="Observação"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>
            Pular
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar e próxima
          </Button>
        </div>
      </footer>
    </section>
  );
}
