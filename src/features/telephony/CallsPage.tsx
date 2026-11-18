import { useMemo, useState, useSyncExternalStore } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Bot,
  Headphones,
  Megaphone,
  PhoneForwarded,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Play,
} from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
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
import { useAccountId } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { formatDayLabel, formatPhone } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCall, useCalls, voiceAgents, type CallFilters, type CallRow } from "./api";
import { CallDetail, CallDetailSheet } from "./CallDetailSheet";
import { CallsLiveStrip } from "./CallsLiveStrip";
import { formatDuration, inCallScope, isMissedCall, type CallScope } from "./lib";
import { useSoftphone } from "./softphone/softphone-context";

const SCOPES: [CallScope, string][] = [
  ["all", "Todas"],
  ["missed", "Perdidas"],
  ["ai", "Atendidas pela IA"],
  ["mine", "Minhas"],
];

const WIDE = "(min-width: 1280px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Ligações: fila ao vivo, histórico por dia com resumo da IA e o detalhe com gravação e transcrição.
export function CallsPage() {
  const accountId = useAccountId();
  const { user } = useAuth();
  const [days, setDays] = useState(7);
  const [scope, setScope] = useState<CallScope>("all");
  const { chamada } = useSearch({ from: "/_app/ligacoes/" });
  const navigate = useNavigate();
  const [picked, setPicked] = useState<{ call: CallRow; play: boolean } | null>(null);
  const linked = useCall(accountId, picked ? undefined : chamada);
  const open = picked?.call ?? linked.data ?? null;
  const select = (c: CallRow | null, play = false) => {
    setPicked(c ? { call: c, play } : null);
    if (!c && chamada) void navigate({ to: "/ligacoes", search: {}, replace: true });
  };
  const filters: CallFilters = { direction: "all", who: "all", status: "all", days };
  const calls = useCalls(accountId, filters);
  const team = useTeamMembers(accountId);
  const agents = voiceAgents.useList(accountId);
  const sp = useSoftphone();
  const wide = useWide();
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const agentNames = useMemo(
    () => new Map((agents.data ?? []).map((a) => [a.id, a.name])),
    [agents.data],
  );
  const all = useMemo(() => calls.data ?? [], [calls.data]);
  const userId = user?.id ?? null;
  const counts = useMemo(
    () =>
      Object.fromEntries(
        SCOPES.map(([k]) => [k, all.filter((c) => inCallScope(c, k, userId)).length]),
      ) as Record<CallScope, number>,
    [all, userId],
  );
  const groups = useMemo(() => {
    const out: { label: string; items: CallRow[] }[] = [];
    for (const c of all.filter((x) => inCallScope(x, scope, userId))) {
      const label = formatDayLabel(c.started_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [all, scope, userId]);

  const agentName = open?.voice_agent_id ? agentNames.get(open.voice_agent_id) : undefined;
  const userName = open?.user_id ? names.get(open.user_id) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Ligações"
        description="O que foi falado, o que a IA resumiu e o que fazer em seguida"
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ligacoes/discador" aria-label="Discador">
                <PhoneForwarded /> <span className="hidden md:inline">Discador</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link to="/ligacoes/agentes">
                <Bot /> Agentes de voz
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link to="/ligacoes/campanhas">
                <Megaphone /> Campanhas
              </Link>
            </Button>
            {sp && (
              <Button size="sm" onClick={() => sp.setOpen(true)}>
                <Headphones /> <span className="hidden sm:inline">Nova ligação</span>
              </Button>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <CallsLiveStrip accountId={accountId} names={names} />

          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
            <div role="radiogroup" aria-label="Mostrar ligações" className="flex flex-wrap gap-1.5">
              {SCOPES.map(([k, label]) => {
                const active = scope === k;
                const n = counts[k];
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setScope(k)}
                    className={cn(
                      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-[background-color,color,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
                      active
                        ? "border-primary bg-primary-soft text-foreground"
                        : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    {k === "ai" && <Bot className="size-3" aria-hidden />}
                    {label}
                    {k !== "all" && n > 0 && (
                      <span
                        className={cn(
                          "tabular-nums",
                          active
                            ? "text-muted-foreground"
                            : k === "missed"
                              ? "text-danger"
                              : "text-subtle",
                        )}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger
                className="ml-auto h-8 w-auto min-w-28 rounded-full text-[12px]"
                aria-label="Período"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {calls.isPending ? (
            <div className="space-y-2 p-4 sm:p-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : calls.isError ? (
            <p className="m-4 rounded-2xl border border-danger/40 px-4 py-6 text-center text-[13px] text-danger sm:m-6">
              Não deu para carregar as ligações: {errorMessage(calls.error)}
            </p>
          ) : all.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={Headphones}
                title="Nenhuma ligação no período"
                description="Conecte a Zadarma em Ajustes › Integrações e crie os ramais em Ajustes › Telefonia. Cada ligação aparece aqui com gravação, transcrição e resumo da IA."
              />
            </div>
          ) : groups.length === 0 ? (
            <p className="m-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground sm:m-6">
              {scope === "missed"
                ? "Nenhuma ligação perdida no período. Boa."
                : scope === "ai"
                  ? "A IA de voz não atendeu ligações no período. Crie um agente em Agentes de voz."
                  : "Você não fez nem recebeu ligações no período."}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h2 className="border-b border-border bg-surface-2/60 px-4 py-2 text-[11px] font-medium tracking-[0.12em] text-subtle uppercase sm:px-6">
                  {g.label}
                </h2>
                <ul className="divide-y divide-border">
                  {g.items.map((c) => (
                    <CallItem
                      key={c.id}
                      call={c}
                      selected={open?.id === c.id}
                      who={
                        c.voice_agent_id
                          ? `IA · ${agentNames.get(c.voice_agent_id) ?? "agente"}`
                          : c.user_id
                            ? (names.get(c.user_id) ?? "Equipe")
                            : null
                      }
                      onOpen={(play) => select(c, play)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {wide && all.length > 0 && (
          <aside
            aria-label="Detalhe da ligação"
            className="w-[440px] shrink-0 overflow-y-auto border-l border-border bg-surface"
          >
            {open ? (
              <CallDetail
                key={open.id}
                accountId={accountId}
                call={open}
                agentName={agentName}
                userName={userName}
                autoPlay={picked?.play}
                onClose={() => select(null)}
              />
            ) : (
              <div className="grid h-full place-items-center p-8 text-center">
                <div>
                  <Headphones className="mx-auto size-6 text-subtle" aria-hidden />
                  <p className="mt-3 text-[14px] font-medium">Escolha uma ligação</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    O resumo da IA, a gravação e a transcrição aparecem aqui.
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
      {!wide && (
        <CallDetailSheet
          accountId={accountId}
          call={open}
          onClose={() => select(null)}
          agentName={agentName}
          userName={userName}
          autoPlay={picked?.play}
        />
      )}
    </div>
  );
}

function CallItem({
  call: c,
  selected,
  who,
  onOpen,
}: {
  call: CallRow;
  selected: boolean;
  who: string | null;
  onOpen: (play: boolean) => void;
}) {
  const missed = isMissedCall(c);
  const Icon = missed ? PhoneMissed : c.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
  const other = c.direction === "inbound" ? c.from_number : c.to_number;
  const name = c.contacts?.name ?? (formatPhone(other) || "Número oculto");
  const sub = c.contacts?.name ? formatPhone(other) : "Contato não salvo";
  const direction = missed ? "Perdida" : c.direction === "inbound" ? "Recebida" : "Feita";
  const tab =
    c.disposition_reason && c.disposition_reason !== c.summary ? c.disposition_reason : null;
  const canPlay = c.recording_status === "stored";
  return (
    <li className="row-wash flex items-stretch" data-selected={selected}>
      <button
        type="button"
        onClick={() => onOpen(false)}
        aria-current={selected ? "true" : undefined}
        className="min-w-0 flex-1 px-4 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:px-6"
      >
        <span className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full",
              missed
                ? "bg-danger/10 text-danger"
                : c.voice_agent_id
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-foreground",
            )}
            role="img"
            aria-label={direction}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{name}</span>
            <span className="block truncate text-[12px] text-subtle tabular-nums">{sub}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[13px] font-medium tabular-nums">
              {timeOf(c.started_at)}
            </span>
            <span
              className={cn(
                "block text-[12px] tabular-nums",
                missed ? "text-danger" : "text-subtle",
              )}
            >
              {missed
                ? "Perdida"
                : c.answered_at
                  ? formatDuration(c.billseconds ?? c.duration_seconds)
                  : "—"}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "mt-2 line-clamp-2 text-[13px] leading-relaxed",
            c.summary ? "text-foreground/85" : "text-subtle italic",
          )}
        >
          {c.summary ??
            (missed ? "Ninguém atendeu. Retorne a ligação." : "Sem resumo da IA ainda.")}
        </span>
        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {who && (
            <span className="rounded-full border border-border px-2 py-[3px] text-[11px] font-medium text-muted-foreground">
              {who}
            </span>
          )}
          {tab && (
            <span className="max-w-[16rem] truncate rounded-full bg-surface-2 px-2 py-[3px] text-[11px] font-medium text-muted-foreground">
              {tab}
            </span>
          )}
          {c.score !== null && (
            <span
              className="ml-auto rounded-full border border-border bg-surface px-2 py-[3px] text-[11px] font-semibold tabular-nums"
              title="Nota de qualidade dada pela IA (0 a 100)"
            >
              Nota {c.score}
            </span>
          )}
        </span>
      </button>
      {canPlay && (
        <div className="flex items-center pr-4 sm:pr-6">
          <button
            type="button"
            onClick={() => onOpen(true)}
            aria-label={`Tocar a gravação da ligação com ${name}`}
            className="grid size-9 place-items-center rounded-full border border-border bg-surface text-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
          >
            <Play className="ml-0.5 size-3.5 fill-current" aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}
