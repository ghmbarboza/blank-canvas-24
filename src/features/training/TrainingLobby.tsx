import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Loader2,
  MessageSquareText,
  Bot,
  Trophy,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamMembers } from "@/features/contacts/api";
import { usePlaybooks } from "@/features/playbooks/api";
import { WeakSpotsCard } from "@/features/quality/WeakSpotsCard";
import { useAuth } from "@/lib/auth";
import { formatListTime, initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  usePersonas,
  useRanking,
  useRoleplayAction,
  useSeedPersonas,
  type Persona,
  type Session,
} from "./api";
import { WEAK_MARK, myTrainingStats, scoreByPersona } from "./lobby";
import { DIFFICULTY_LABEL, type Difficulty } from "./roleplay";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// Entrada do Treino: cabeçalho que orienta, clientes para praticar à esquerda e o histórico à direita.
export function TrainingLobby({
  accountId,
  isManager,
  sessions,
  loading,
  onOpen,
}: {
  accountId: string;
  isManager: boolean;
  sessions: Session[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const { user } = useAuth();
  const personas = usePersonas(accountId);
  const playbooks = usePlaybooks(accountId);
  const seed = useSeedPersonas(accountId);
  const act = useRoleplayAction(accountId);
  const team = useTeamMembers(accountId);
  const [playbookId, setPlaybookId] = useState<string>("auto");
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const list = personas.data ?? [];
  const personaName = useMemo(
    () => new Map((personas.data ?? []).map((p) => [p.id, p.name])),
    [personas.data],
  );
  const mine = sessions.filter((s) => s.user_id === user?.id);
  const stats = useMemo(() => myTrainingStats(sessions, user?.id), [sessions, user?.id]);
  const byPersona = useMemo(() => scoreByPersona(sessions, user?.id), [sessions, user?.id]);
  const lastFinished = mine.find((s) => s.status === "finished");
  const firstName = (user ? names.get(user.id) : undefined)?.split(" ")[0];
  const focus = lastFinished?.improvements[0];

  async function begin(personaId: string) {
    try {
      const s = await act.mutateAsync({
        action: "start",
        personaId,
        playbookId: playbookId === "auto" ? null : playbookId,
      });
      onOpen(s.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-8 sm:py-10">
      <section aria-labelledby="treino-intro" className="max-w-3xl">
        <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          Treino de vendas
        </span>
        <h2
          id="treino-intro"
          className="mt-4 font-display text-[30px] leading-[1.1] font-medium text-foreground sm:text-[40px]"
        >
          Pronto para o próximo treino?
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}.{" "}
          {focus ? (
            <>
              No seu último treino, o ponto a melhorar foi{" "}
              <strong className="font-semibold text-foreground">{focus}</strong>. Escolha um cliente
              abaixo e pratique de novo.
            </>
          ) : (
            "O cliente é a IA e a nota vem do seu playbook. Converse por texto como se fosse a call e encerre para ver o que cobriu e o que faltou."
          )}
        </p>
      </section>

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <section aria-labelledby="treino-clientes" className="min-w-0 lg:col-span-7">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
            <h3 id="treino-clientes" className="text-[14px] font-medium">
              Clientes para treinar
            </h3>
            {list.length > 0 && (
              <Select value={playbookId} onValueChange={setPlaybookId}>
                <SelectTrigger className="h-9 w-full sm:w-64" aria-label="Playbook que guia a nota">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Nota pelo playbook padrão</SelectItem>
                  {(playbooks.data ?? []).map((pb) => (
                    <SelectItem key={pb.row.id} value={pb.row.id}>
                      Nota por: {pb.content.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {personas.isPending ? (
            <div className="mt-6 space-y-4">
              {Array.from({ length: 2 }, (_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="Nenhum cliente simulado ainda"
              description={
                isManager
                  ? "Crie três clientes simulados de exemplo (fácil, médio e difícil) ou cadastre os do seu mercado em Novo cliente simulado."
                  : "Peça a um gestor para cadastrar os clientes simulados de treino."
              }
              action={
                isManager && (
                  <Button
                    onClick={() =>
                      seed.mutate(undefined, {
                        onSuccess: (r) => toast.success(`${r.created} personas criadas`),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                    disabled={seed.isPending}
                  >
                    {seed.isPending ? <Loader2 className="animate-spin" /> : <Bot />} Criar exemplos
                  </Button>
                )
              }
            />
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {list.map((p, i) => (
                <li key={p.id}>
                  <PersonaArticle
                    persona={p}
                    mine={byPersona.get(p.id)}
                    primary={i === 0}
                    busy={
                      act.isPending &&
                      act.variables?.action === "start" &&
                      act.variables.personaId === p.id
                    }
                    disabled={act.isPending}
                    onStart={() => void begin(p.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="min-w-0 space-y-8 lg:col-span-5">
          <ScoreCard stats={stats} feedback={lastFinished?.feedback ?? null} />

          <section aria-labelledby="treino-historico">
            <div className="flex items-end justify-between border-b border-border pb-3">
              <h3 id="treino-historico" className="text-[14px] font-medium">
                Seus últimos treinos
              </h3>
              {mine.length > 0 && (
                <span className="text-[12px] text-subtle tabular-nums">{mine.length} no total</span>
              )}
            </div>
            {loading ? (
              <Skeleton className="mt-4 h-24 w-full rounded-xl" />
            ) : mine.length === 0 ? (
              <p className="py-6 text-[13px] text-muted-foreground">
                Você ainda não treinou. Escolha um cliente ao lado: o primeiro treino leva uns 10
                minutos.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {mine.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <HistoryRow
                      session={s}
                      persona={personaName.get(s.persona_id ?? "") ?? "Persona removida"}
                      onOpen={() => onOpen(s.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isManager && <WeakSpotsCard accountId={accountId} canCreate compact />}
          {isManager && <RankingCard accountId={accountId} names={names} />}
        </aside>
      </div>
    </div>
  );
}

function PersonaArticle({
  persona: p,
  mine,
  primary,
  busy,
  disabled,
  onStart,
}: {
  persona: Persona;
  mine: { avg: number; n: number } | undefined;
  primary: boolean;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  const weak = mine !== undefined && mine.avg < WEAK_MARK;
  return (
    <article className="relative py-7 pl-5 sm:pl-6">
      <span
        className={cn(
          "absolute top-7 bottom-7 left-0 w-0.5 rounded-full",
          weak || primary ? "bg-primary" : "bg-border",
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <DifficultyChip d={p.difficulty as Difficulty} />
        {p.objections.length > 0 && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {p.objections.length} {p.objections.length === 1 ? "objeção" : "objeções"}
          </span>
        )}
        {weak && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-foreground">
            <ArrowDownRight className="size-3" aria-hidden /> Ponto de melhoria
          </span>
        )}
        <span className="ml-auto text-[11px] text-subtle tabular-nums">
          {mine
            ? `${mine.n} ${mine.n === 1 ? "treino seu" : "treinos seus"} · média ${mine.avg}`
            : "Ainda não treinou"}
        </span>
      </div>
      <h4 className="mt-3 font-display text-[20px] leading-tight font-semibold text-foreground">
        {p.name}
      </h4>
      {(p.role || p.company) && (
        <p className="mt-0.5 text-[13px] text-subtle">
          {[p.role, p.company].filter(Boolean).join(" · ")}
        </p>
      )}
      {p.profile && (
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          {p.profile}
        </p>
      )}
      {p.objections.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Objeções que o cliente levanta">
          {p.objections.slice(0, 4).map((o) => (
            <li
              key={o}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-muted-foreground"
            >
              “{o}”
            </li>
          ))}
        </ul>
      )}
      <Button
        className="mt-5"
        size={primary ? "lg" : "default"}
        variant={primary ? "default" : "outline"}
        onClick={onStart}
        disabled={disabled}
      >
        {busy ? <Loader2 className="animate-spin" /> : <MessageSquareText />} Treinar por texto
      </Button>
    </article>
  );
}

function ScoreCard({
  stats,
  feedback,
}: {
  stats: { avg: number | null; previous: number | null; count: number };
  feedback: string | null;
}) {
  const delta = stats.avg !== null && stats.previous !== null ? stats.avg - stats.previous : null;
  return (
    <section
      aria-labelledby="treino-media"
      className="atmosphere relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-primary"
    >
      <h3 id="treino-media" className="text-[13px] opacity-80">
        Sua média no treino (30 dias)
      </h3>
      <div className="mt-3 flex items-end gap-3">
        <p className="font-display text-[52px] leading-none font-semibold tabular-nums">
          {stats.avg ?? "—"}
          {stats.avg !== null && <span className="ml-1 text-[18px] opacity-60">/100</span>}
        </p>
        {delta !== null && (
          <span className="mb-1.5 inline-flex items-center gap-0.5 rounded-full bg-white/12 px-2 py-0.5 text-[12px] font-medium tabular-nums">
            {delta < 0 ? (
              <ArrowDownRight className="size-3.5" aria-hidden />
            ) : (
              <ArrowUpRight className="size-3.5" aria-hidden />
            )}
            {delta > 0 ? "+" : ""}
            {delta} pts
          </span>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed opacity-75">
        {stats.count === 0
          ? "Encerre um treino para ver a sua nota aqui."
          : (feedback ?? `${stats.count} treinos encerrados no mês.`)}
      </p>
    </section>
  );
}

function HistoryRow({
  session: s,
  persona,
  onOpen,
}: {
  session: Session;
  persona: string;
  onOpen: () => void;
}) {
  const active = s.status === "active";
  const turns = s.messages.filter((m) => m.role === "seller").length;
  const good = !active && s.score !== null && s.score >= WEAK_MARK;
  const line = active ? "Em andamento: continue de onde parou" : (s.improvements[0] ?? s.feedback);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="row-wash flex w-full items-start gap-3 rounded-xl px-2 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={cn(
          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums",
          active
            ? "border-2 border-dashed border-border-strong text-subtle"
            : good
              ? "bg-primary-soft text-foreground"
              : "bg-surface-2 text-foreground",
        )}
        aria-hidden
      >
        {active ? "…" : good ? <Check className="size-4" /> : (s.score ?? "—")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{persona}</span>
          {!active && (
            <span className="shrink-0 text-[13px] font-semibold tabular-nums">
              {s.score ?? "—"}/100
            </span>
          )}
        </span>
        {line && (
          <span className="mt-0.5 line-clamp-2 block text-[12px] text-muted-foreground">
            {line}
          </span>
        )}
        <span className="mt-1 block text-[11px] text-subtle">
          {formatListTime(s.created_at)} · {turns} {turns === 1 ? "fala" : "falas"}
        </span>
      </span>
    </button>
  );
}

function RankingCard({ accountId, names }: { accountId: string; names: Map<string, string> }) {
  const ranking = useRanking(accountId, true);
  return (
    <section aria-labelledby="treino-ranking">
      <h3
        id="treino-ranking"
        className="flex items-center gap-1.5 border-b border-border pb-3 text-[14px] font-medium"
      >
        <Trophy className="size-4 text-subtle" aria-hidden /> Ranking do time (30 dias)
      </h3>
      {(ranking.data ?? []).length === 0 ? (
        <p className="py-6 text-[13px] text-muted-foreground">
          Ninguém encerrou um treino nos últimos 30 dias.
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {(ranking.data ?? []).map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="w-5 text-[12px] font-semibold text-subtle tabular-nums">
                {i + 1}
              </span>
              <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold">
                {initials(names.get(r.user_id) ?? "?")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {names.get(r.user_id) ?? "Pessoa"}
              </span>
              <span className="text-[11px] text-subtle tabular-nums">{r.sessions} treinos</span>
              <span className="w-10 text-right font-display text-[15px] font-semibold tabular-nums">
                {r.avg_score ?? "—"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function DifficultyChip({ d }: { d: Difficulty }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        d === "hard"
          ? "bg-primary text-primary-foreground"
          : d === "medium"
            ? "bg-primary-soft text-foreground"
            : "bg-surface-2 text-muted-foreground",
      )}
    >
      {DIFFICULTY_LABEL[d] ?? d}
    </span>
  );
}
