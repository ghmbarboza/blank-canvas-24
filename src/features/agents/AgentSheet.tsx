import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { AgentConfigForm } from "./AgentConfigForm";
import { AgentEvalPanel } from "./AgentEvalPanel";
import { AgentSimulator } from "./AgentSimulator";
import { AgentToolsPanel } from "./AgentToolsPanel";
import { useEvalRuns, useUpdateAgent, type Agent } from "./api";
import { roleDef } from "./catalog";
import { AgentAvatar, StatusPill } from "./ui";

type Props = { accountId: string; agent: Agent | null; team: Agent[]; onClose: () => void };

// Ficha do agente: conversar com ele no simulador, ajustar, escolher ferramentas e avaliar.
export function AgentSheet({ accountId, agent, team, onClose }: Props) {
  return (
    <Sheet open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        {agent && (
          <Body key={agent.id} accountId={accountId} agent={agent} team={team} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  accountId,
  agent,
  team,
  onClose,
}: {
  accountId: string;
  agent: Agent;
  team: Agent[];
  onClose: () => void;
}) {
  const { isManager } = useAccount();
  const runs = useEvalRuns(accountId, agent.id);
  const update = useUpdateAgent(accountId);
  const latest = (runs.data ?? []).find(
    (r) => r.status === "done" && r.agent_version === agent.version,
  );
  const approved = agent.role === "supervisor" || (latest?.pass_rate ?? 0) >= 0.9;
  const on = agent.status === "active";

  function toggle(next: boolean) {
    update.mutate(
      {
        id: agent.id,
        patch: {
          status: next ? "active" : "paused",
          status_reason: next ? null : "Desligado pelo gestor.",
        },
      },
      {
        onSuccess: () =>
          toast.success(
            next ? `${agent.name} começou a atender` : `${agent.name} parou de atender`,
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  const hint = on
    ? "Atendendo os clientes agora."
    : approved
      ? "Aprovado na avaliação. Pode ligar."
      : "Para ligar, rode a avaliação e passe com 90% ou mais.";

  return (
    <>
      <SheetHeader className="border-b border-border p-5 text-left">
        <div className="flex items-start gap-3">
          <AgentAvatar agent={agent} size={48} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{agent.name}</SheetTitle>
            <SheetDescription>
              {roleDef(agent.role).label} · versão {agent.version}
            </SheetDescription>
            <div className="mt-2">
              <StatusPill status={agent.status} />
            </div>
          </div>
          {isManager && (
            <label className="flex flex-col items-end gap-1 text-[12px]">
              <Switch
                checked={on}
                disabled={update.isPending || (!on && !approved)}
                onCheckedChange={toggle}
                aria-label={on ? "Desligar agente" : "Ligar agente"}
              />
              <span className="max-w-40 text-right text-subtle">{hint}</span>
            </label>
          )}
        </div>
      </SheetHeader>
      <Tabs defaultValue="testar" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-5 mt-3 self-start">
          <TabsTrigger value="testar">Testar</TabsTrigger>
          <TabsTrigger value="config">Configurar</TabsTrigger>
          <TabsTrigger value="ferramentas">Ferramentas</TabsTrigger>
          <TabsTrigger value="avaliacao">Avaliação</TabsTrigger>
        </TabsList>
        <TabsContent value="testar" className="min-h-0 flex-1 overflow-hidden">
          <AgentSimulator accountId={accountId} agent={agent} />
        </TabsContent>
        <TabsContent value="config" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          <AgentConfigForm accountId={accountId} agent={agent} team={team} onDeleted={onClose} />
        </TabsContent>
        <TabsContent value="ferramentas" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          <AgentToolsPanel accountId={accountId} agent={agent} />
        </TabsContent>
        <TabsContent value="avaliacao" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          <AgentEvalPanel accountId={accountId} agent={agent} runs={runs.data ?? []} />
        </TabsContent>
      </Tabs>
    </>
  );
}
