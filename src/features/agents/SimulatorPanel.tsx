// Simulador da equipe: fica fixo à direita no desktop e abre em gaveta no celular.
// Reaproveita o AgentSimulator (agent.simulate, ações em modo de ensaio).
import { useState } from "react";
import { PlayCircle } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";

import { AgentSimulator } from "./AgentSimulator";
import type { Agent } from "./api";

type Props = { accountId: string; agents: Agent[]; inDrawer?: boolean };

function defaultAgent(list: Agent[]): Agent | undefined {
  return list.find((a) => a.is_entry) ?? list.find((a) => a.status === "active") ?? list[0];
}

export function SimulatorPanel({ accountId, agents, inDrawer = false }: Props) {
  const talkers = agents.filter((a) => a.role !== "supervisor");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const agent = talkers.find((a) => a.id === pickedId) ?? defaultAgent(talkers);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-border px-4 py-3",
          inDrawer && "pr-14",
        )}
      >
        <h2 className="flex items-center gap-2 text-[14px] font-medium">
          <PlayCircle className="size-4 text-muted-foreground" aria-hidden /> Simulador
        </h2>
        {agent && (
          <Select value={agent.id} onValueChange={setPickedId}>
            <SelectTrigger
              className="h-8 w-auto max-w-[60%] gap-2 rounded-full bg-surface-2 text-[12px]"
              aria-label="Agente que vai responder"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {talkers.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {agent ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <AgentSimulator key={agent.id} accountId={accountId} agent={agent} />
          </div>
          <p className="px-4 pb-3 text-[11px] text-subtle">
            Modo de rascunho. Nada será salvo nas conversas nem enviado a cliente.
          </p>
        </div>
      ) : (
        <p className="m-auto max-w-60 p-6 text-center text-[13px] text-muted-foreground">
          Crie um agente para conversar com ele aqui antes de ligar.
        </p>
      )}
    </div>
  );
}
