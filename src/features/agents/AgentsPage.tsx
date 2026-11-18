import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bot, MessageSquareText, PlayCircle, Plug, Plus } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { enabledModules } from "@/components/layout/modules";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { AgentCard } from "./AgentCard";
import { ApprovalsPanel } from "./autopilot/ApprovalsPanel";
import { AutopilotCard } from "./autopilot/AutopilotCard";
import { AgentSheet } from "./AgentSheet";
import { ChannelCoverage } from "./ChannelCoverage";
import { useAgents, useEvalTrends, useFlags, useOverview, useTodayCounts } from "./api";
import { FlagsPanel } from "./FlagsPanel";
import { NewAgentDialog } from "./NewAgentDialog";
import { SimulatorPanel } from "./SimulatorPanel";
import { SupervisorSetupCard } from "./SupervisorSetupCard";

// Equipe de IA: cada agente é uma pessoa do time, com papel, situação, avaliação e números da semana.
export function AgentsPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const agents = useAgents(accountId);
  const overview = useOverview(accountId);
  const flags = useFlags(accountId);
  const today = useTodayCounts(accountId);
  const trends = useEvalTrends(accountId);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const list = agents.data ?? [];
  const selected = list.find((a) => a.id === open) ?? null;
  const active = list.filter((a) => a.status === "active" && a.role !== "supervisor").length;
  const ov = overview.data;
  const hasSupervisor = list.some((a) => a.role === "supervisor");
  const operating =
    active === 0
      ? "Nenhum agente atendendo agora. Ative um agente para a IA começar a responder."
      : `${active} ${active === 1 ? "agente atendendo" : "agentes atendendo"} agora`;
  const askOn = enabledModules(current?.settings).has("pergunte");
  // Sem atividade nenhuma, a faixa de números vira só zeros: mostra o próximo passo no lugar.
  const hasActivity =
    ov !== undefined &&
    (active > 0 || ov.handoffs_human > 0 || ov.flags_open > 0 || ov.silent_open > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Equipe de IA"
        description={agents.data ? operating : "Agentes que atendem, vendem e cobram"}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/equipe-ia/ferramentas" aria-label="Ferramentas conectadas">
                <Plug aria-hidden />{" "}
                <span className="hidden md:inline">Ferramentas conectadas</span>
              </Link>
            </Button>
            {askOn && (
              <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
                <Link to="/pergunte" aria-label="Pergunte ao Nexus">
                  <MessageSquareText aria-hidden />{" "}
                  <span className="hidden md:inline">Pergunte ao Nexus</span>
                </Link>
              </Button>
            )}
            {list.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setSimOpen(true)}
                aria-label="Abrir simulador"
              >
                <PlayCircle aria-hidden />
              </Button>
            )}
            {isManager && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden /> <span className="sr-only sm:not-sr-only">Novo agente</span>
              </Button>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {isManager && list.length > 0 ? <AutopilotCard accountId={accountId} /> : null}
          <ApprovalsPanel accountId={accountId} where="equipe" className="mb-5" />
          {ov && list.length > 0 && !hasActivity && (
            <p className="mb-5 rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] text-muted-foreground">
              Os números da equipe aparecem quando um agente começar a atender. Abra um agente
              abaixo, confira a avaliação e ative.
            </p>
          )}
          {ov && list.length > 0 && hasActivity && (
            <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Atendendo agora" value={active} hint={`de ${list.length} agentes`} />
              <Metric
                label="Passadas para a equipe (7 dias)"
                value={ov.handoffs_human}
                hint={`${ov.handoffs_with_owner} com dono definido`}
              />
              <Metric label="Alertas do supervisor" value={ov.flags_open} hint="abertos agora" />
              <Metric
                label="Conversas caladas sem dono"
                value={ov.silent_open}
                hint={ov.silent_open === 0 ? "nenhuma, como deve ser" : "precisam de alguém"}
                strong={ov.silent_open > 0}
              />
            </dl>
          )}
          {(flags.data ?? []).length > 0 && (
            <FlagsPanel accountId={accountId} flags={flags.data ?? []} />
          )}

          {agents.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-52 rounded-2xl" />
              ))}
            </div>
          ) : agents.isError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Não deu para carregar a equipe"
              description={errorMessage(agents.error)}
              action={<Button onClick={() => void agents.refetch()}>Tentar de novo</Button>}
            />
          ) : list.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="Monte sua equipe de IA"
              description="Crie um agente para cada canal (WhatsApp, Instagram, Ligação…), com jeito e regras próprios, ou comece pela Recepção, que atende todos e passa para o agente certo. Cada um passa por uma avaliação com perguntas reais da sua empresa antes de atender."
              action={
                isManager && (
                  <Button onClick={() => setCreating(true)}>
                    <Bot /> Criar o primeiro agente
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ChannelCoverage accountId={accountId} agents={list} onOpen={setOpen} />
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {list.map((a) => (
                  <li key={a.id}>
                    <AgentCard
                      agent={a}
                      stats={ov?.agents[a.id]}
                      trend={trends.data?.[a.id]}
                      attendedToday={today.data ? (today.data.attended[a.id] ?? 0) : undefined}
                      handoffsToday={today.data ? (today.data.handoffsHuman[a.id] ?? 0) : undefined}
                      onOpen={() => setOpen(a.id)}
                    />
                  </li>
                ))}
              </ul>
              {!hasSupervisor && isManager && (
                <SupervisorSetupCard accountId={accountId} onCreated={(id) => setOpen(id)} />
              )}
            </>
          )}
        </div>
        {list.length > 0 && (
          <aside
            aria-label="Simulador"
            className="hidden w-[380px] shrink-0 border-l border-border bg-surface pb-20 lg:flex lg:flex-col"
          >
            <SimulatorPanel accountId={accountId} agents={list} />
          </aside>
        )}
      </div>
      <Sheet open={simOpen} onOpenChange={setSimOpen}>
        <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 p-0 lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Simulador</SheetTitle>
            <SheetDescription>Converse com um agente como se fosse um cliente.</SheetDescription>
          </SheetHeader>
          <SimulatorPanel accountId={accountId} agents={list} inDrawer />
        </SheetContent>
      </Sheet>
      <NewAgentDialog
        accountId={accountId}
        open={creating}
        hasAgents={list.length > 0}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setOpen(id);
        }}
      />
      <AgentSheet
        accountId={accountId}
        agent={selected}
        team={list}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: number;
  hint: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "rounded-xl bg-primary p-4 text-primary-foreground"
          : "rounded-xl border border-border bg-surface p-4"
      }
    >
      <dt className={strong ? "text-[12px] opacity-80" : "text-[12px] text-muted-foreground"}>
        {label}
      </dt>
      <dd
        className={
          /^(R\$\s*)?0([,.]0+)?%?$/.test(String(value).trim())
            ? "mt-1 font-display text-[18px] font-semibold tabular-nums opacity-60"
            : "mt-1 font-display text-2xl font-semibold tabular-nums"
        }
      >
        {value}
      </dd>
      <dd className={strong ? "text-[11px] opacity-80" : "text-[11px] text-subtle"}>{hint}</dd>
    </div>
  );
}
