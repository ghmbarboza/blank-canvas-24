import { useState } from "react";
import { Mail, MessageSquare, Phone, Settings2, Users } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCallCenterTeam, useLive, type LiveAgent, type TeamRow } from "./api";
import { AGENT_STATE_LABEL, type AgentState } from "./lib";
import { PRESENCE_DOT, capacityTone } from "./routing-copy";
import { MemberRow } from "./TeamPanel";

/** Avatar com a bolinha de presença: verde só quando está disponível de verdade. */
export function AgentAvatar({ name, state }: { name: string; state: AgentState | null }) {
  return (
    <span className="relative shrink-0">
      <span className="grid size-10 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
        {initials(name)}
      </span>
      {state && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background",
            PRESENCE_DOT[state],
          )}
          aria-hidden
        />
      )}
    </span>
  );
}

function Cell({
  icon: Icon,
  label,
  used,
  cap,
}: {
  icon: typeof Phone;
  label: string;
  used: number;
  cap: number;
}) {
  const tone = capacityTone(used, cap);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2",
        tone === "over" ? "border-danger/40 bg-danger/5 text-danger" : "border-border bg-surface",
      )}
      title={`${label}: ${used} de ${cap} ao mesmo tempo`}
    >
      <Icon className={cn("size-3.5", tone !== "over" && "text-subtle")} aria-hidden />
      <span className="text-[12px] tabular-nums">
        <span className={cn("font-semibold", tone === "idle" && "text-muted-foreground")}>
          {used}
        </span>
        <span className={tone === "over" ? "" : "text-subtle"}> / {cap}</span>
        <span className="sr-only"> {label}</span>
      </span>
    </div>
  );
}

function MemberCard({
  row,
  live,
  onAdjust,
}: {
  row: TeamRow;
  live: LiveAgent | undefined;
  onAdjust: () => void;
}) {
  const on = Boolean(row.agent?.is_active);
  const state = live?.state ?? (on ? "offline" : null);
  const away = !on || state === "offline" || state === "paused";
  const stateText = !on
    ? "Não atende na fila"
    : state === "paused" && live?.pause_reason
      ? `Pausa (${live.pause_reason.toLowerCase()})`
      : state
        ? AGENT_STATE_LABEL[state]
        : "";
  return (
    <li className="border-b border-border py-5 first:pt-0 last:border-b-0">
      <div className="flex items-start gap-3">
        <AgentAvatar name={row.name} state={on ? state : null} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn("truncate text-[14px] font-semibold", away && "text-muted-foreground")}
            >
              {row.name}
            </p>
            <span className="shrink-0 text-[11px] text-subtle">{stateText}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {row.skills.length === 0 ? (
              <span className="text-[11px] text-subtle">sem habilidade</span>
            ) : (
              row.skills.map((s) => (
                <span
                  key={s.skill}
                  className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {s.skill}
                </span>
              ))
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mt-1 -mr-2 shrink-0"
          aria-label={`Ajustar ${row.name}`}
          onClick={onAdjust}
        >
          <Settings2 />
        </Button>
      </div>
      {on && row.agent && (
        <div className={cn("mt-3 grid grid-cols-3 gap-2", away && "opacity-60")}>
          <Cell icon={Phone} label="ligações" used={live?.voice ?? 0} cap={row.agent.cap_voice} />
          <Cell
            icon={MessageSquare}
            label="conversas"
            used={live?.chat ?? 0}
            cap={row.agent.cap_chat}
          />
          <Cell
            icon={Mail}
            label="e-mails e chamados"
            used={live?.other ?? 0}
            cap={row.agent.cap_email + row.agent.cap_task}
          />
        </div>
      )}
    </li>
  );
}

// Coluna "Equipe e capacidade": quem atende, o que sabe, e quanto está usando agora de cada canal.
export function TeamCapacity({ accountId }: { accountId: string }) {
  const team = useCallCenterTeam(accountId);
  const live = useLive(accountId);
  const [adjust, setAdjust] = useState<string | null>(null);
  const byUser = new Map((live.data?.agents ?? []).map((a) => [a.user_id, a]));
  const rows = [...(team.data ?? [])].sort(
    (a, b) =>
      Number(Boolean(b.agent?.is_active)) - Number(Boolean(a.agent?.is_active)) ||
      a.name.localeCompare(b.name),
  );
  const editing = rows.find((r) => r.userId === adjust);

  return (
    <section aria-labelledby="fila-equipe">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <h2 id="fila-equipe" className="font-display text-[20px] font-medium">
          Equipe e capacidade
        </h2>
      </div>
      <p className="mt-3 mb-5 text-[12px] text-muted-foreground">
        Agora / limite ao mesmo tempo, por canal. Em vermelho quando passa do limite.
      </p>
      {team.isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : team.isError ? (
        <p className="text-[13px] text-danger">{errorMessage(team.error)}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Ninguém na conta ainda"
          description="Convide as pessoas em Ajustes › Equipe e volte aqui para dizer quem atende."
        />
      ) : (
        <>
          {!rows.some((r) => r.agent?.is_active) && (
            <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">
              Ninguém atende na fila ainda. Toque no ajuste ao lado de cada pessoa, ligue “Atende na
              fila” e diga o que ela sabe fazer.
            </p>
          )}
          <ul>
            {rows.map((r) => (
              <MemberCard
                key={r.userId}
                row={r}
                live={byUser.get(r.userId)}
                onAdjust={() => setAdjust(r.userId)}
              />
            ))}
          </ul>
        </>
      )}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajustar {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ul>
              <MemberRow row={editing} accountId={accountId} />
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
