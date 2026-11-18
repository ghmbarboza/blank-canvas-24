// Passos do assistente de configuração (P13): "Monte sua equipe de IA" e "Conecte suas ferramentas".
import { useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";

import { BrandTile } from "@/components/brand/BrandIcon";
import { AgentSheet } from "./AgentSheet";
import { agentKeys, agentsApi, useAgents, useOverview } from "./api";
import { roleDef } from "./catalog";
import { ComposioPanel } from "./ComposioPanel";
import { useAgentsSetupStatus, useComposioSetupStatus } from "./setup-status";
import { AgentAvatar, PassBar, StatusPill } from "./ui";

type StepProps = { accountId: string; onDone: () => void };

const QUICK = ["reception", "sac", "sdr", "collection"];

export function AgentsSetupStep({ accountId, onDone }: StepProps) {
  const qc = useQueryClient();
  const agents = useAgents(accountId);
  const overview = useOverview(accountId);
  const status = useAgentsSetupStatus(accountId);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const list = agents.data ?? [];
  const has = (role: string) => list.some((a) => a.role === role);

  async function create(key: string) {
    setBusy(key);
    try {
      const r = await agentsApi<{ agentId: string }>(accountId, "template.create", {
        template: key,
      });
      await qc.invalidateQueries({ queryKey: agentKeys.all(accountId) });
      setOpen(r.agentId);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        Cada agente é uma pessoa do time de IA. A Recepção entende o que o cliente quer e passa para
        o certo; quando a IA não resolve, a conversa ganha um dono da sua equipe com prazo. Nenhum
        agente atende antes de acertar 90% de uma avaliação feita com a sua base e as conversas
        reais.
      </p>
      {/* modelos como pessoas do time (direção do AIDesigner): escolhe, cria e já testa conversando */}
      {QUICK.some((k) => !has(k)) ? (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {QUICK.filter((k) => !has(k)).map((k) => {
            const r = roleDef(k);
            const first = k === "reception" && !list.length;
            return (
              <li key={k}>
                <div
                  className={
                    "flex h-full flex-col gap-3 rounded-xl border bg-surface p-4 transition " +
                    (first
                      ? "border-primary shadow-[0_1px_0_var(--ink-06),0_10px_28px_-16px_var(--ink-30)]"
                      : "border-border hover:border-foreground/25")
                  }
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[14px] font-semibold text-foreground"
                    >
                      {r.label.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[14.5px] font-semibold">
                        {r.label}
                        {first ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            comece por aqui
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                        {r.summary}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="mt-auto self-start"
                    variant={first ? "default" : "outline"}
                    disabled={!!busy}
                    onClick={() => void create(k)}
                  >
                    {busy === k ? <Loader2 className="animate-spin" /> : <Bot />} Criar e testar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {agents.isPending ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        list.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {list.map((a) => {
              const ev = overview.data?.agents[a.id]?.last_eval;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(a.id)}
                    className="row-wash flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <AgentAvatar agent={a} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{a.name}</span>
                      {a.role !== "supervisor" && (
                        <span className="mt-1 block max-w-48">
                          <PassBar rate={ev && ev.version === a.version ? ev.pass_rate : null} />
                        </span>
                      )}
                    </span>
                    <StatusPill status={a.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px]">
          {status.done && (
            <CheckCircle2 className="mr-1 inline size-4 text-foreground" aria-hidden />
          )}
          {status.summary}
        </p>
        <Button onClick={onDone} disabled={!status.done}>
          Continuar
        </Button>
      </div>
      <AgentSheet
        accountId={accountId}
        agent={list.find((a) => a.id === open) ?? null}
        team={list}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

export function ComposioSetupStep({ accountId, onDone }: StepProps) {
  const status = useComposioSetupStatus(accountId);
  return (
    <div className="space-y-4">
      <div className="flex gap-2" aria-hidden>
        {["gmail", "outlook", "googlecalendar", "hubspot"].map((b) => (
          <BrandTile key={b} id={b} size={28} />
        ))}
      </div>
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        Opcional. Ligue o Gmail ou o Outlook do atendente, a Agenda do Google, o HubSpot e outros
        apps para a equipe de IA ler e agir neles. A conexão é feita por um link da Composio, com a
        conta gratuita da sua empresa.
      </p>
      <ComposioPanel accountId={accountId} compact />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px]">
          {status.done && (
            <CheckCircle2 className="mr-1 inline size-4 text-foreground" aria-hidden />
          )}
          {status.summary}
        </p>
        <div className="flex gap-2">
          {!status.done && (
            <Button variant="ghost" onClick={onDone}>
              Pular por agora
            </Button>
          )}
          <Button onClick={onDone} disabled={!status.done}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
