// Quem atende cada canal: um agente por canal (WhatsApp, Instagram, Ligação…), com a mesma regra
// que o servidor usa para escolher (pickActiveAgent). Mostra o buraco antes do cliente achar.
import { ChannelIcon } from "@/components/brand/ChannelIcon";
import { useChannels } from "@/features/channels/api";
import { pickActiveAgent, type AgentLite } from "@/backend/agents/orchestrator-logic";

import type { Agent } from "./api";
import { agentChannelsFor } from "./catalog";

type Props = { accountId: string; agents: Agent[]; onOpen: (id: string) => void };

const lite = (a: Agent): AgentLite => ({
  id: a.id,
  name: a.name,
  role: a.role as AgentLite["role"],
  status: a.status as AgentLite["status"],
  channels: a.channels ?? [],
  is_entry: a.is_entry,
  priority: a.priority,
});

/** Situação do canal conectado: sem canal, IA desligada em todos, ou ok. */
function channelState(channels: { platform: string; ai_enabled: boolean }[], id: string) {
  const mine = channels.filter(
    (c) => c.platform === id || (id === "voice" && c.platform === "phone"),
  );
  if (!mine.length) return "none" as const;
  return mine.some((c) => c.ai_enabled) ? ("on" as const) : ("off" as const);
}

export function ChannelCoverage({ accountId, agents, onOpen }: Props) {
  const channels = useChannels(accountId);
  const team = agents.map(lite);
  // o que atenderia se os rascunhos já estivessem ligados: mostra "falta ligar" no lugar de "ninguém"
  const asIfActive = team.map((a) =>
    a.status === "draft" ? { ...a, status: "active" as const } : a,
  );

  return (
    <section
      aria-labelledby="por-canal"
      className="mb-5 rounded-2xl border border-border bg-surface p-4"
    >
      <h2 id="por-canal" className="eyebrow">
        Quem atende cada canal
      </h2>
      <ul className="mt-3 grid gap-x-8 gap-y-2.5 xl:grid-cols-2">
        {agentChannelsFor().map((c) => {
          const now = pickActiveAgent(team, c.id, null);
          const next = now ? null : pickActiveAgent(asIfActive, c.id, null);
          const who = now ?? next;
          const state = channels.data ? channelState(channels.data, c.id) : "on";
          return (
            <li key={c.id} className="grid grid-cols-[8rem_1fr] items-start gap-x-3 text-[13px]">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <span aria-hidden className="inline-flex">
                  <ChannelIcon platform={c.id} size={16} />
                </span>
                {c.label}
              </span>
              <span className="min-w-0">
                {who ? (
                  <button
                    type="button"
                    onClick={() => onOpen(who.id)}
                    className="text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {who.name}
                  </button>
                ) : (
                  <span className="text-subtle">Sem agente: vai direto para a equipe</span>
                )}
                {next && <span className="ml-1 text-subtle">(rascunho, falta ligar)</span>}
                {who && state === "off" && (
                  <span className="ml-1 text-[12px] text-danger">· IA desligada no canal</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
