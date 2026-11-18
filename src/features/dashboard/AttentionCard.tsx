import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, Flame, Hand, LifeBuoy, Loader2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useAttentionSources, useClaimConversation } from "./api";
import {
  ATTENTION_ACTION,
  buildAttention,
  type AttentionItem,
  type AttentionKind,
} from "./attention";
import { DEMO_ATTENTION } from "./demo";
import { EmptyNote } from "./ui";

const ICON: Record<AttentionKind, LucideIcon> = {
  ticket_late: LifeBuoy,
  ticket_due: LifeBuoy,
  hot_waiting: Flame,
  handoff: Hand,
  deal_stalled: Briefcase,
};

const CONTEXT: Record<AttentionKind, string> = {
  ticket_late: "Atendimento",
  ticket_due: "Atendimento",
  hot_waiting: "Caixa de entrada",
  handoff: "Passagem da IA",
  deal_stalled: "CRM",
};

// O que precisa de você: 3 a 5 pendências reais, cada uma com o motivo e um botão que resolve.
export function AttentionCard({ demo, className }: { demo: boolean; className?: string }) {
  const sources = useAttentionSources(!demo);
  const items = useMemo(
    () => (demo ? DEMO_ATTENTION : sources.data ? buildAttention(sources.data) : []),
    [demo, sources.data],
  );

  return (
    <section
      aria-labelledby="painel-atencao"
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-5 md:p-6",
        className,
      )}
    >
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Agora</p>
          <h2
            id="painel-atencao"
            className="mt-1.5 font-display text-[20px] leading-tight font-medium text-foreground"
          >
            O que precisa de você
          </h2>
        </div>
        {items.length > 0 && (
          <span className="shrink-0 text-[12px] text-subtle">
            {items.length} {items.length === 1 ? "item" : "itens"}, mais urgente primeiro
          </span>
        )}
      </header>

      {!demo && sources.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando pendências">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !demo && sources.isError ? (
        <EmptyNote>Não deu para carregar as pendências: {errorMessage(sources.error)}</EmptyNote>
      ) : items.length === 0 ? (
        <EmptyNote>
          Nada pendente agora. Lead quente sem resposta, passagem da IA sem dono, chamado perto do
          prazo e negócio parado aparecem aqui.
        </EmptyNote>
      ) : (
        <ol className="space-y-3">
          {items.map((item, i) => (
            <Row key={item.key} item={item} first={i === 0} demo={demo} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Row({ item, first, demo }: { item: AttentionItem; first: boolean; demo: boolean }) {
  const Icon = ICON[item.kind];
  return (
    <li
      className={cn(
        "relative flex gap-3.5 overflow-hidden rounded-xl border p-4 transition-colors",
        first ? "border-primary-line bg-primary-soft/50" : "border-border bg-surface",
      )}
    >
      {first && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />}
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border",
          first
            ? "border-primary bg-primary-soft text-foreground"
            : "border-border bg-surface-2 text-foreground",
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-snug font-semibold text-foreground">{item.title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{item.reason}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Action item={item} primary={first} demo={demo} />
          <span className="text-[11px] text-subtle">{CONTEXT[item.kind]}</span>
        </div>
      </div>
    </li>
  );
}

function Action({ item, primary, demo }: { item: AttentionItem; primary: boolean; demo: boolean }) {
  const navigate = useNavigate();
  const claim = useClaimConversation();
  const label = ATTENTION_ACTION[item.kind];
  const variant = primary ? "default" : "outline";

  if (demo) {
    return (
      <Button size="sm" variant={variant} disabled title="Exemplo: conecte um canal para agir">
        {label}
      </Button>
    );
  }
  switch (item.kind) {
    case "handoff":
      return (
        <Button
          size="sm"
          variant={variant}
          disabled={claim.isPending}
          onClick={() =>
            claim.mutate(item.ref, {
              onSuccess: (id) =>
                void navigate({ to: "/inbox/$conversationId", params: { conversationId: id } }),
            })
          }
        >
          {claim.isPending && <Loader2 className="animate-spin" />}
          {label}
        </Button>
      );
    case "hot_waiting":
      return (
        <Button asChild size="sm" variant={variant}>
          <Link to="/inbox/$conversationId" params={{ conversationId: item.ref }}>
            {label}
          </Link>
        </Button>
      );
    case "deal_stalled":
      return (
        <Button asChild size="sm" variant={variant}>
          <Link to="/crm" search={{ negocio: item.ref }}>
            {label}
          </Link>
        </Button>
      );
    default:
      return (
        <Button asChild size="sm" variant={variant}>
          <Link to="/atendimento" search={{ chamado: item.ref }}>
            {label}
          </Link>
        </Button>
      );
  }
}
