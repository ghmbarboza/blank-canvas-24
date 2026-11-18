import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Pause, Phone, PhoneForwarded, Play, Plus, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAccountId } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { formatPhone, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useSoftphone } from "../softphone/softphone-context";
import {
  OUTCOME_LABEL,
  saveOutcome,
  useDialerContacts,
  useDialerSessions,
  useUpdateDialerSession,
  type DialerContact,
  type DialerSession,
  type DialerStats,
  type Outcome,
} from "./api";
import { NewSessionDialog } from "./NewSessionDialog";

const POWER_DELAY_S = 5;
const QUEUE_PREVIEW = 8;
const OUTCOMES: Outcome[] = ["talked", "no_answer", "voicemail", "callback", "not_interested"];

// Discador preview/power: uma ficha por vez, resultado em um clique e a fila andando sozinha.
export function DialerPage() {
  const accountId = useAccountId();
  const sessions = useDialerSessions(accountId);
  const [creating, setCreating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const active =
    (sessions.data ?? []).find((s) => s.id === sessionId) ??
    (sessions.data ?? []).find((s) => s.status === "active") ??
    null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Discador"
        description="Ligue para uma lista em sequência, com a ficha e a leitura da IA na tela"
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ligacoes">
                <ArrowLeft /> Ligações
              </Link>
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Nova sessão
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sessions.isLoading ? (
          <div className="mx-auto max-w-6xl p-6">
            <Skeleton className="h-80 rounded-[28px]" />
          </div>
        ) : active ? (
          <Session key={active.id} accountId={accountId} session={active} />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={PhoneForwarded}
              title="Nenhuma sessão em andamento"
              description="Escolha um segmento e o discador monta a fila com quem tem telefone."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Começar uma sessão
                </Button>
              }
            />
          </div>
        )}
        {(sessions.data ?? []).length > 1 && (
          <PastSessions
            sessions={sessions.data ?? []}
            activeId={active?.id}
            onPick={(id) => setSessionId(id)}
          />
        )}
      </div>
      <NewSessionDialog
        accountId={accountId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(s) => setSessionId(s.id)}
      />
    </div>
  );
}

function Session({ accountId, session }: { accountId: string; session: DialerSession }) {
  const { user } = useAuth();
  const sp = useSoftphone();
  const update = useUpdateDialerSession(accountId);
  const [position, setPosition] = useState(session.position);
  const [stats, setStats] = useState<DialerStats>((session.stats ?? {}) as DialerStats);
  const [note, setNote] = useState("");
  const [called, setCalled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const total = session.contact_ids.length;
  const queue = useMemo(
    () => session.contact_ids.slice(position, position + QUEUE_PREVIEW + 1),
    [session.contact_ids, position],
  );
  const contacts = useDialerContacts(queue);
  const current = contacts.data?.[0] ?? null;
  const done = position >= total;
  const autoDial = useRef(false);

  async function dial(c: DialerContact) {
    if (!sp) {
      toast.error("O telefone do navegador não está disponível nesta conta");
      return;
    }
    setCalled(true);
    await sp.dial({ contactId: c.id, phone: c.phone, name: c.name });
  }

  async function record(outcome: Outcome) {
    if (!current || !user) return;
    try {
      await saveOutcome(accountId, user.id, current.id, outcome, note);
      const nextStats = { ...stats, [outcome]: (stats[outcome] ?? 0) + 1 };
      const nextPos = position + 1;
      await update.mutateAsync({
        id: session.id,
        patch: {
          position: nextPos,
          stats: nextStats,
          status: nextPos >= total ? "finished" : "active",
        },
      });
      setStats(nextStats);
      setPosition(nextPos);
      setNote("");
      setCalled(false);
      autoDial.current = session.mode === "power" && outcome !== "skipped" && !paused;
      if (autoDial.current && nextPos < total) setCountdown(POWER_DELAY_S);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  // Power: conta 5 s e liga para o próximo, a menos que o vendedor pause.
  useEffect(() => {
    if (countdown === null) return undefined;
    if (paused) {
      setCountdown(null);
      return undefined;
    }
    if (countdown === 0) {
      setCountdown(null);
      if (current && !sp?.activeCall) void dial(current);
      return undefined;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
    // dial e current mudam a cada render; o efeito só depende do relógio e da pausa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, paused]);

  // atalhos: 1–5 registram o resultado, L liga, P pula (fora de campos de texto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey || !current) return;
      const n = Number(e.key);
      if (n >= 1 && n <= OUTCOMES.length) void record(OUTCOMES[n - 1]!);
      else if (e.key.toLowerCase() === "l" && !sp?.activeCall) void dial(current);
      else if (e.key.toLowerCase() === "p") void record("skipped");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // record e dial leem o estado atual a cada render; reassinar por contato basta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, sp?.activeCall]);

  if (done)
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-[28px] bg-[#0A1F3B] p-8 text-white">
          <p className="eyebrow !text-white/60">Sessão concluída</p>
          <h2 className="mt-2 font-display text-[28px] font-medium">{session.name}</h2>
          <StatsRow stats={stats} total={total} className="mt-6" dark />
        </div>
      </div>
    );

  return (
    <div className="mx-auto grid max-w-6xl gap-5 p-4 md:p-6 lg:grid-cols-[1fr_320px]">
      <section aria-label="Contato da vez" className="space-y-4">
        <div className="relative overflow-hidden rounded-[28px] bg-[#0A1F3B] p-6 text-white md:p-8">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/60">
            <span className="eyebrow !text-white/60">{session.name}</span>
            <span aria-hidden>·</span>
            <span>
              {position + 1} de {total}
            </span>
            <span className="ml-auto rounded-full bg-white/10 px-2.5 py-0.5 font-medium uppercase tracking-wide text-white/80">
              {session.mode === "power" ? "Power" : "Preview"}
            </span>
          </div>
          <Progress value={(position / total) * 100} className="mt-3 h-1.5 bg-white/10" />
          {contacts.isLoading || !current ? (
            <Skeleton className="mt-6 h-24 rounded-2xl bg-white/10" />
          ) : (
            <ContactCard contact={current} />
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button
              size="lg"
              className="bg-white text-[#0A1F3B] hover:bg-white/90"
              disabled={!current?.phone || Boolean(sp?.dialing) || Boolean(sp?.activeCall)}
              onClick={() => current && void dial(current)}
            >
              <Phone /> {called ? "Ligar de novo" : "Ligar"}
            </Button>
            <Button
              variant="ghost"
              className="text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => void record("skipped")}
            >
              <SkipForward /> Pular
            </Button>
            {session.mode === "power" && (
              <Button
                variant="ghost"
                className="ml-auto text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => setPaused((p) => !p)}
                aria-pressed={paused}
              >
                {paused ? <Play /> : <Pause />} {paused ? "Retomar" : "Pausar"}
              </Button>
            )}
          </div>
          {sp?.activeCall && (
            <p
              role="status"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-[13px] text-white"
            >
              <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden />
              Em ligação · <CallTimer since={sp.activeCall.started_at} />
            </p>
          )}
          {countdown !== null && (
            <p role="status" className="mt-3 text-[13px] text-white/80">
              Ligando para o próximo em {countdown} s…{" "}
              <button type="button" className="underline" onClick={() => setPaused(true)}>
                pausar
              </button>
            </p>
          )}
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-[14px] font-medium">Como foi?</h2>
          <p className="text-[12px] text-muted-foreground">
            O resultado vai para a ligação e a fila anda. "Retornar depois" cria uma tarefa para
            amanhã. Atalhos: 1–5 resultado, L ligar, P pular.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OUTCOMES.map((o, i) => (
              <Button
                key={o}
                variant={o === "talked" ? "default" : "outline"}
                disabled={!current || update.isPending}
                onClick={() => void record(o)}
                aria-keyshortcuts={String(i + 1)}
                className="justify-between"
              >
                {OUTCOME_LABEL[o]}
                <kbd className="font-mono text-[10px] opacity-50">{i + 1}</kbd>
              </Button>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anotação rápida (opcional)"
            aria-label="Anotação da ligação"
            className="mt-3"
            rows={2}
          />
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-[13px] font-medium">Resultado até aqui</h2>
          <StatsRow stats={stats} total={total} className="mt-3" />
        </div>
        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-[13px] font-medium">Próximos</h2>
          <ol className="mt-3 space-y-2">
            {(contacts.data ?? []).slice(1).map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 text-[13px]">
                <span className="w-5 text-right font-mono text-[11px] text-subtle">
                  {position + i + 2}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.name ?? formatPhone(c.phone)}</span>
                {c.score !== null && (
                  <span className="font-mono text-[11px] tabular-nums text-subtle">{c.score}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function CallTimer({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return (
    <span className="font-mono tabular-nums">
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function ContactCard({ contact: c }: { contact: DialerContact }) {
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          to="/contatos/$contactId"
          params={{ contactId: c.id }}
          className="font-display text-[30px] leading-tight font-semibold hover:underline"
        >
          {c.name ?? "Sem nome"}
        </Link>
        {c.company && <span className="text-white/70">{c.company}</span>}
      </div>
      <p className="mt-1 font-mono text-[15px] text-white/85">{formatPhone(c.phone)}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
        {c.score !== null && (
          <span className="rounded-full bg-white/10 px-2.5 py-1">Nota {c.score}</span>
        )}
        {c.ai_intent && <span className="rounded-full bg-white/10 px-2.5 py-1">{c.ai_intent}</span>}
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/70">
          Último contato {c.last_interaction_at ? formatRelative(c.last_interaction_at) : "—"}
        </span>
      </div>
      {(c.ai_summary || c.ai_next_step) && (
        <div className="mt-4 rounded-2xl bg-white/[0.06] p-4 text-[14px] leading-relaxed">
          {c.ai_summary && <p className="text-white/85">{c.ai_summary}</p>}
          {c.ai_next_step && (
            <p className="mt-2 text-white">
              <span className="text-white/60">Sugestão da IA: </span>
              {c.ai_next_step}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatsRow({
  stats,
  total,
  className,
  dark = false,
}: {
  stats: DialerStats;
  total: number;
  className?: string;
  dark?: boolean;
}) {
  const shown: Outcome[] = ["talked", "no_answer", "callback", "not_interested", "voicemail"];
  return (
    <dl className={cn("grid grid-cols-3 gap-3", className)}>
      {shown.map((o) => (
        <div key={o}>
          <dt className={cn("text-[11px]", dark ? "text-white/60" : "text-subtle")}>
            {OUTCOME_LABEL[o]}
          </dt>
          <dd className="font-display text-[22px] font-semibold tabular-nums">{stats[o] ?? 0}</dd>
        </div>
      ))}
      <div>
        <dt className={cn("text-[11px]", dark ? "text-white/60" : "text-subtle")}>Na fila</dt>
        <dd className="font-display text-[22px] font-semibold tabular-nums">{total}</dd>
      </div>
    </dl>
  );
}

function PastSessions({
  sessions,
  activeId,
  onPick,
}: {
  sessions: DialerSession[];
  activeId: string | undefined;
  onPick: (id: string) => void;
}) {
  return (
    <section aria-label="Sessões anteriores" className="mx-auto max-w-6xl px-4 pb-8 md:px-6">
      <h2 className="eyebrow mb-2">Outras sessões</h2>
      <ul className="divide-y divide-border rounded-[24px] border border-border bg-surface">
        {sessions
          .filter((s) => s.id !== activeId)
          .map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="text-subtle">
                  {Math.min(s.position, s.contact_ids.length)}/{s.contact_ids.length}
                </span>
                <span className="text-subtle">
                  {s.status === "finished" ? "Concluída" : "Em andamento"}
                </span>
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}
