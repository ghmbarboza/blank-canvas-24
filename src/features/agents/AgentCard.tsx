// Cartão de pessoa da equipe de IA: quem é, se está atendendo, como foi na avaliação e o dia de hoje.
import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { cn } from "@/lib/utils";

import type { Agent, EvalTrend, Overview } from "./api";
import { agentChannelLabel, roleDef } from "./catalog";
import { evalDrop } from "./eval-drop";
import { AgentAvatar, PassBar, StatusPill } from "./ui";

type Stats = Overview["agents"][string];

type Props = {
  agent: Agent;
  stats: Stats | undefined;
  trend: EvalTrend | undefined;
  /** undefined = número indisponível (não inventamos zero) */
  attendedToday: number | undefined;
  handoffsToday: number | undefined;
  onOpen: () => void;
};

const pct = (n: number) => Math.round(n * 100);
const channelsText = (cs: string[]) =>
  cs.length ? cs.map(agentChannelLabel).join(", ") : "todos os canais";

export function AgentCard({ agent, stats, trend, attendedToday, handoffsToday, onOpen }: Props) {
  const rate = stats?.last_eval?.pass_rate ?? null;
  const evalCurrent = stats?.last_eval?.version === agent.version;
  const isSupervisor = agent.role === "supervisor";
  const drop = isSupervisor ? null : evalDrop(trend);
  const role = roleDef(agent.role);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Abrir ${agent.name}`}
      className={cn(
        "lift relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 text-left",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        agent.status !== "active" && "bg-surface/70",
      )}
    >
      {drop && <span className="absolute inset-y-0 left-0 w-1 bg-danger" aria-hidden />}
      <span className="flex items-start gap-3">
        <AgentAvatar agent={agent} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight font-semibold">
            {agent.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {role.label}
            {agent.is_entry ? " · porta de entrada" : ""}
          </span>
          {!isSupervisor && (
            <span
              className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground"
              title={`Atende: ${channelsText(agent.channels ?? [])}`}
            >
              {(agent.channels ?? []).length ? (
                (agent.channels ?? []).map((c) => <ChannelIcon key={c} platform={c} size={14} />)
              ) : (
                <span>Todos os canais</span>
              )}
            </span>
          )}
        </span>
        <StatusPill status={agent.status} />
      </span>

      {isSupervisor ? (
        <span className="mt-4 block text-[13px] text-muted-foreground">
          {agent.goal || role.summary}
          <span className="mt-2 block text-[12px] text-subtle">Vigia a fila a cada 5 minutos.</span>
        </span>
      ) : (
        <>
          <span className="mt-5 block">
            <span className="mb-1.5 flex items-baseline justify-between text-[12px]">
              <span className="text-muted-foreground">
                {rate === null
                  ? "Ainda não avaliado"
                  : evalCurrent
                    ? "Avaliação"
                    : "Avaliação de versão antiga"}
              </span>
              {rate !== null && (
                <span className={cn("font-semibold tabular-nums", drop && "text-danger")}>
                  {pct(rate)}%
                </span>
              )}
            </span>
            <PassBar rate={evalCurrent ? rate : null} danger={!!drop} />
            {drop && (
              <span className="mt-2 block text-[12px] leading-snug text-danger">
                Caiu de {drop.from}% para {drop.to}% na última avaliação. Abra o agente para ver as
                perguntas que ele errou.
              </span>
            )}
          </span>
          {agent.status_reason && !drop && (
            <span className="mt-2 block text-[12px] text-foreground">{agent.status_reason}</span>
          )}
          <span className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-4">
            <Count label="Atendimentos hoje" value={attendedToday} />
            <Count label="Repasses humanos" value={handoffsToday} />
          </span>
        </>
      )}
      {!isSupervisor && <span className="sr-only">Clique para testar, ajustar ou avaliar.</span>}
    </button>
  );
}

function Count({ label, value }: { label: string; value: number | undefined }) {
  return (
    <span className="block">
      <span className="block text-[11px] text-subtle">{label}</span>
      <span className="mt-0.5 block font-display text-[22px] leading-none font-semibold tabular-nums">
        {value ?? "–"}
      </span>
    </span>
  );
}
