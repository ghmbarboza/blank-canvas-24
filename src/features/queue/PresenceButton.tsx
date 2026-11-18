import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Coffee, LogOut, PhoneIncoming, Radio } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useMyAgent, useMyItems, useQueueRealtime, useSetPresence } from "./api";
import {
  AGENT_STATE_LABEL,
  PAUSE_REASONS,
  agentLoad,
  deriveAgentState,
  type AgentState,
} from "./lib";

const DOT: Record<AgentState, string> = {
  available: "bg-success",
  busy: "bg-primary",
  wrap_up: "bg-warm",
  paused: "bg-border-strong",
  offline: "bg-transparent ring-1 ring-border-strong",
};

/**
 * Presença do atendente, sempre visível no topo do menu (e na barra do celular). Só aparece para
 * quem está na equipe de atendimento. Também avisa quando a fila reservou algo para a pessoa.
 */
export function PresenceButton({
  accountId,
  compact = false,
}: {
  accountId: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const me = useMyAgent(accountId, user?.id);
  const items = useMyItems(accountId, me.data?.agent?.is_active ? user?.id : undefined);
  const set = useSetPresence(accountId);
  const navigate = useNavigate();
  const [, tick] = useState(0);
  useQueueRealtime(accountId, Boolean(me.data?.agent?.is_active));
  const wrapUntil = me.data?.presence?.wrap_up_until ?? null;
  useEffect(() => {
    if (!wrapUntil) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [wrapUntil]);

  const reserved = (items.data?.items ?? []).filter(
    (i) => i.status === "reserved" && i.reserved_user_id === user?.id,
  );
  const reservedCount = reserved.length;
  useEffect(() => {
    if (reservedCount > 0)
      toast("Tem um atendimento reservado para você", {
        action: { label: "Abrir", onClick: () => void navigate({ to: "/fila" }) },
      });
  }, [reservedCount, navigate]);

  if (!me.data?.agent?.is_active) return null;
  const active = (items.data?.items ?? []).filter((i) => i.status === "assigned");
  const load = agentLoad(
    me.data.agent,
    active.map((i) => i.capacity_class as "voice" | "chat" | "email" | "task"),
  );
  const state = deriveAgentState({
    chosen: (me.data.presence?.status ?? null) as "offline" | "available" | "paused" | null,
    wrapUpUntil: wrapUntil,
    load,
    now: new Date(),
  });
  const label =
    state === "paused" && me.data.presence?.pause_reason
      ? `Pausa: ${me.data.presence.pause_reason}`
      : AGENT_STATE_LABEL[state];
  const wrapLeft =
    state === "wrap_up" && wrapUntil
      ? Math.max(0, Math.round((new Date(wrapUntil).getTime() - Date.now()) / 1000))
      : null;

  const change = (status: "available" | "paused" | "offline", reason?: string) =>
    set.mutate(
      { status, ...(reason ? { reason } : {}) },
      {
        onSuccess: () =>
          toast.success(
            status === "available"
              ? "Você está disponível"
              : status === "paused"
                ? `Em pausa${reason ? `: ${reason}` : ""}`
                : "Você saiu da fila",
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Sua presença: ${label}. Trocar`}
        className={cn(
          "group flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-surface text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          compact ? "w-10 justify-center" : "w-full px-3",
        )}
      >
        <span className="relative grid size-4 place-items-center" aria-hidden>
          <span className={cn("size-2.5 rounded-full", DOT[state])} />
          {reserved.length > 0 && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-danger" />
          )}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            {wrapLeft !== null && (
              <span className="text-[11px] text-subtle tabular-nums">{wrapLeft}s</span>
            )}
            <ChevronDown className="size-3.5 text-subtle" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {state === "busy"
            ? `Em atendimento: ${active.length} agora`
            : state === "wrap_up"
              ? "Conclua o pós-atendimento em Minha fila"
              : "Como você está agora?"}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => change("available")}>
          <Radio className="size-4" /> Disponível para atender
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {PAUSE_REASONS.map((r) => (
          <DropdownMenuItem key={r} onSelect={() => change("paused", r)}>
            <Coffee className="size-4" /> Pausa: {r}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/fila" })}>
          <PhoneIncoming className="size-4" /> Abrir minha fila
          {reserved.length > 0 && (
            <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
              {reserved.length}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => change("offline")}>
          <LogOut className="size-4" /> Sair da fila
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
