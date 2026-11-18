import { hasChannel } from "@/lib/edition";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ear, Maximize2, Minimize2, MonitorPlay, Radio } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount, useAccountId } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useLive, type LiveAgent, type LiveStats } from "./api";
import { IndicatorsSection } from "./IndicatorsSection";
import { AGENT_STATE_LABEL, channelLabel, formatSeconds, type AgentState } from "./lib";
import { PRESENCE_DOT } from "./routing-copy";
import { SuperviseDialog } from "./SuperviseDialog";
import { QueueHeader } from "./QueueHeader";
import { AgentAvatar } from "./TeamCapacity";

const STATE_ORDER: AgentState[] = ["available", "busy", "wrap_up", "paused", "offline"];

function pct(v: number | null | undefined) {
  return v === null || v === undefined ? "–" : `${v}%`;
}

function Kpi({
  label,
  value,
  hint,
  tone = "plain",
  big,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "alert" | "lead";
  big: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "lead"
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-surface",
        tone === "alert" && "border-danger/50",
      )}
    >
      <p className={cn("eyebrow !text-[10px]", tone === "lead" && "!text-primary-foreground/70")}>
        {label}
      </p>
      <p
        className={cn(
          "font-display font-semibold tabular-nums",
          big ? "text-6xl" : "text-4xl",
          tone === "alert" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint && (
        <p
          className={cn(
            "mt-1 text-[12px]",
            tone === "lead" ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function AgentCard({
  a,
  canSupervise,
  onSupervise,
}: {
  a: LiveAgent;
  canSupervise: boolean;
  onSupervise: () => void;
}) {
  const since = a.current_voice?.since ?? a.since;
  const secs = since ? (Date.now() - new Date(since).getTime()) / 1000 : null;
  const onCall = Boolean(a.current_voice);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <AgentAvatar name={a.name} state={a.state} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{a.name}</p>
        <p className="truncate text-[12px] text-muted-foreground">
          {a.state === "paused" && a.pause_reason
            ? `Pausa: ${a.pause_reason}`
            : AGENT_STATE_LABEL[a.state]}
          {onCall
            ? " · em ligação"
            : a.chat + a.other > 0
              ? ` · ${a.chat + a.other} em aberto`
              : ""}
          {secs !== null && a.state !== "offline" ? ` · ${formatSeconds(secs)}` : ""}
        </p>
      </div>
      <span
        className="flex w-14 shrink-0 flex-col items-end gap-1"
        title="Quanto da capacidade está em uso"
      >
        <span className="text-[11px] text-subtle tabular-nums">{Math.round(a.load * 100)}%</span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <span
            className={cn("block h-full rounded-full", a.load > 1 ? "bg-danger" : "bg-primary")}
            style={{ width: `${Math.min(100, Math.round(a.load * 100))}%` }}
          />
        </span>
      </span>
      {canSupervise && onCall && hasChannel("phone") && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={onSupervise}
          aria-label={`Supervisionar ${a.name}`}
        >
          <Ear className="size-4" /> <span className="hidden sm:inline">Ouvir</span>
        </Button>
      )}
    </li>
  );
}

function Board({
  data,
  big,
  canSupervise,
}: {
  data: LiveStats;
  big: boolean;
  canSupervise: boolean;
}) {
  const [supervise, setSupervise] = useState<LiveAgent | null>(null);
  const t = data.today;
  const breached = data.queue.reduce((s, q) => s + q.breached, 0);
  const agents = [...data.agents].sort(
    (x, y) =>
      STATE_ORDER.indexOf(x.state) - STATE_ORDER.indexOf(y.state) || x.name.localeCompare(y.name),
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="Esperando agora"
          value={String(data.waiting_total)}
          hint={
            data.waiting_total
              ? `mais antigo: ${formatSeconds(data.longest_wait_seconds)}`
              : "fila vazia"
          }
          tone="lead"
          big={big}
        />
        <Kpi
          label="Prazo do dia cumprido"
          value={pct(t.sla_met_pct)}
          hint={breached ? `${breached} passando do prazo agora` : "dentro do prazo"}
          tone={breached ? "alert" : "plain"}
          big={big}
        />
        {hasChannel("phone") && (
          <Kpi
            label="Abandono (ligações)"
            value={pct(t.abandon_rate)}
            hint={`${t.abandoned} desistiram hoje`}
            big={big}
          />
        )}
        <Kpi
          label="Espera média · TME"
          value={formatSeconds(t.tme_seconds)}
          hint={`atendimento médio · TMA ${formatSeconds(t.tma_seconds)}`}
          big={big}
        />
        <Kpi
          label="Resolvido pela IA"
          value={pct(t.ai_resolution_pct)}
          hint={`${t.ai_resolved} de ${t.ai_touched} sem passar para gente`}
          big={big}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section
          aria-labelledby="fila-canal"
          className="rounded-xl border border-border bg-surface p-5"
        >
          <h2 id="fila-canal" className="mb-4 font-display text-[18px] font-medium">
            Fila por canal
          </h2>
          {data.queue.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Ninguém esperando em nenhum canal.</p>
          ) : (
            <ul className="space-y-2">
              {data.queue.map((q) => (
                <li key={q.channel} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span
                    className={cn("w-32 truncate font-medium", big ? "text-[18px]" : "text-[14px]")}
                  >
                    {channelLabel(q.channel)}
                  </span>
                  <span
                    className={cn(
                      "font-display font-semibold tabular-nums",
                      big ? "text-3xl" : "text-xl",
                    )}
                  >
                    {q.waiting}
                  </span>
                  <span className="ml-auto text-right text-[12px] text-muted-foreground tabular-nums">
                    espera {formatSeconds(q.oldest_wait_seconds)}
                    {q.breached > 0 && (
                      <span className="ml-2 text-danger">{q.breached} fora do prazo</span>
                    )}
                    {q.at_risk > 0 && <span className="ml-2">{q.at_risk} quase no prazo</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasChannel("phone") && (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Retornos de ligação esperando:{" "}
              <strong className="tabular-nums">{data.callbacks_pending}</strong>
            </p>
          )}
        </section>

        <section
          aria-labelledby="equipe"
          className="rounded-xl border border-border bg-surface p-5"
        >
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 id="equipe" className="font-display text-[18px] font-medium">
              Equipe
            </h2>
            {STATE_ORDER.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className={cn("size-2 rounded-full", PRESENCE_DOT[s])} aria-hidden />
                {AGENT_STATE_LABEL[s]}{" "}
                <strong className="tabular-nums text-foreground">
                  {data.agent_states[s] ?? 0}
                </strong>
              </span>
            ))}
          </div>
          {agents.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Ninguém na equipe de atendimento ainda.
            </p>
          ) : (
            <ul
              className={cn(
                "grid grid-cols-1 gap-2",
                big ? "md:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2",
              )}
            >
              {agents.map((a) => (
                <AgentCard
                  key={a.user_id}
                  a={a}
                  canSupervise={canSupervise}
                  onSupervise={() => setSupervise(a)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
      {supervise && <SuperviseDialog agent={supervise} onClose={() => setSupervise(null)} />}
    </div>
  );
}

export function LivePage() {
  const accountId = useAccountId();
  const { isManager } = useAccount();
  const live = useLive(accountId);
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        ref={ref}
        className={cn(
          "mx-auto w-full max-w-[1280px] bg-background px-4 pt-8 pb-16 md:px-10 md:pt-12",
          full && "h-dvh max-w-none overflow-y-auto p-8 md:p-10",
        )}
      >
        {full ? (
          <div className="mb-6 flex items-center gap-3">
            <MonitorPlay className="size-5 text-primary" aria-hidden />
            <p className="font-display text-[26px] font-semibold">Operação ao vivo</p>
            <span className="flex items-center gap-1.5 text-[13px] text-foreground">
              <Radio className="size-4" aria-hidden /> atualizando sozinho
            </span>
            <div className="flex-1" />
            <Button variant="outline" onClick={toggle}>
              <Minimize2 className="size-4" /> Sair da tela cheia
            </Button>
          </div>
        ) : (
          <div className="mb-10">
            <QueueHeader
              title="Painel ao vivo"
              description="Quem está esperando, como está a equipe e o prazo do dia, em tempo real. Bom para a TV da operação."
              meta={
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium">
                  <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
                  Atualizando sozinho
                </span>
              }
              actions={
                <>
                  <Button asChild variant="ghost">
                    <Link to="/fila">Minha fila</Link>
                  </Button>
                  {isManager && (
                    <Button asChild variant="outline">
                      <Link to="/fila/roteamento">Fila e roteamento</Link>
                    </Button>
                  )}
                  <Button onClick={toggle} aria-label="Tela cheia para TV">
                    <Maximize2 className="size-4" />{" "}
                    <span className="hidden sm:inline">Tela cheia</span>
                  </Button>
                </>
              }
            />
          </div>
        )}
        {live.isLoading ? (
          <div className="grid gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : live.isError ? (
          <EmptyState
            icon={MonitorPlay}
            title="O painel não carregou"
            description={errorMessage(live.error)}
          />
        ) : live.data ? (
          <Board data={live.data} big={full} canSupervise={isManager} />
        ) : null}
        {!full && (
          <div className="mt-10">
            <IndicatorsSection accountId={accountId} />
          </div>
        )}
      </div>
    </div>
  );
}
