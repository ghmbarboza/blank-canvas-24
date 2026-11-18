import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Columns3, LifeBuoy, List, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTeamMembers } from "@/features/contacts/api";
import { useAccount } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { formatRelative, initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useTickets, useUpdateTicket, type TicketRow } from "./api";
import {
  OPEN_STATUSES,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  STATUS_LABEL,
  slaState,
  type TicketPriority,
  type TicketStatus,
} from "./constants";
import { NewTicketDialog } from "./NewTicketDialog";
import { SlaChip } from "./SlaChip";
import { SurveysPanel } from "./SurveysPanel";
import { TicketChannel } from "./TicketChannel";
import { TicketsMetricsBar } from "./TicketsMetricsBar";
import { TicketSheet } from "./TicketSheet";
import { PriorityPill, TicketsKanban } from "./TicketsKanban";

type StatusFilter = "active" | "all" | TicketStatus;

interface Props {
  ticketId: string | null;
  tab: "chamados" | "pesquisas";
  onOpenTicket: (id: string | null) => void;
  onTab: (tab: "chamados" | "pesquisas") => void;
}

// Fila do SAC: chamados com SLA ao vivo, em lista ou quadro, e as pesquisas de satisfação.
export function TicketsPage({ ticketId, tab, onOpenTicket, onTab }: Props) {
  const { current } = useAccount();
  const accountId = current!.accountId;
  const { user } = useAuth();
  const tickets = useTickets(accountId);
  const update = useUpdateTicket(accountId);
  const team = useTeamMembers(accountId);
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [priority, setPriority] = useState<"all" | TicketPriority>("all");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );

  // Filtros comuns à lista e ao quadro (o quadro ignora o filtro de status: as colunas já são os status).
  const matching = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (tickets.data ?? [])
      .filter((t) => priority === "all" || t.priority === priority)
      .filter((t) => !mine || t.owner_user_id === user?.id)
      .filter(
        (t) =>
          !term ||
          t.subject.toLowerCase().includes(term) ||
          String(t.number) === term.replace("#", "") ||
          (t.contact?.name ?? "").toLowerCase().includes(term),
      );
  }, [tickets.data, priority, mine, q, user?.id]);

  const list = useMemo(() => {
    return matching
      .filter((t) =>
        status === "active"
          ? OPEN_STATUSES.includes(t.status as TicketStatus)
          : status === "all" || t.status === status,
      )
      .sort((a, b) => {
        // Mais urgente primeiro: atrasados, depois menor folga do SLA, depois prioridade.
        const sa = slaState(a).minutesLeft ?? Number.MAX_SAFE_INTEGER;
        const sb = slaState(b).minutesLeft ?? Number.MAX_SAFE_INTEGER;
        if (sa !== sb) return sa - sb;
        return (
          PRIORITY_ORDER.indexOf(a.priority as TicketPriority) -
          PRIORITY_ORDER.indexOf(b.priority as TicketPriority)
        );
      });
  }, [matching, status]);

  function move(t: TicketRow, to: TicketStatus) {
    if (t.status === to) return;
    update.mutate(
      { id: t.id, patch: { status: to } },
      {
        onSuccess: () => toast.success(`#${t.number} → ${STATUS_LABEL[to]}`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Chamados"
        description="Cada pedido do cliente com prazo de resposta e de solução"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/atendimento/base">
                <BookOpen /> <span className="hidden sm:inline">Base de conhecimento</span>
              </Link>
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Novo chamado
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-5 p-4 sm:p-6">
          <section aria-label="Indicadores dos últimos 30 dias">
            <TicketsMetricsBar accountId={accountId} />
          </section>
          <Tabs value={tab} onValueChange={(v) => onTab(v as "chamados" | "pesquisas")}>
            <TabsList>
              <TabsTrigger value="chamados">Chamados</TabsTrigger>
              <TabsTrigger value="pesquisas">Pesquisas (CSAT e NPS)</TabsTrigger>
            </TabsList>
            <TabsContent value="chamados" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
                  <Search
                    className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
                    aria-hidden
                  />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Assunto, cliente ou #número"
                    className="pl-9"
                    aria-label="Buscar chamados"
                  />
                </div>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                  <SelectTrigger
                    className={cn("w-44", view === "kanban" && "hidden")}
                    aria-label="Status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Em aberto (todos)</SelectItem>
                    {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as "all" | TicketPriority)}
                >
                  <SelectTrigger className="w-36" aria-label="Prioridade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toda prioridade</SelectItem>
                    {PRIORITY_ORDER.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Switch checked={mine} onCheckedChange={setMine} /> Só os meus
                </label>
                <div className="ml-auto flex rounded-full border border-border p-0.5">
                  <button
                    type="button"
                    aria-label="Lista"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                    className={cn(
                      "rounded-full p-1.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      view === "list" ? "bg-primary text-primary-foreground" : "text-subtle",
                    )}
                  >
                    <List className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Quadro"
                    aria-pressed={view === "kanban"}
                    onClick={() => setView("kanban")}
                    className={cn(
                      "rounded-full p-1.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      view === "kanban" ? "bg-primary text-primary-foreground" : "text-subtle",
                    )}
                  >
                    <Columns3 className="size-4" />
                  </button>
                </div>
              </div>

              {tickets.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-14 rounded-2xl" />
                  ))}
                </div>
              ) : tickets.isError ? (
                <p className="rounded-2xl border border-danger/40 px-4 py-6 text-center text-[13px] text-danger">
                  Não deu para carregar os chamados: {errorMessage(tickets.error)}
                </p>
              ) : (tickets.data ?? []).length === 0 ? (
                <EmptyState
                  icon={LifeBuoy}
                  title="Nenhum chamado ainda"
                  description="Abra chamados aqui ou numa conversa da Caixa de entrada. Cada um ganha prazo de resposta e de solução pela prioridade."
                  action={
                    <Button onClick={() => setCreating(true)}>
                      <Plus /> Abrir o primeiro chamado
                    </Button>
                  }
                />
              ) : view === "list" ? (
                list.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
                    Nenhum chamado neste filtro.
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-[24px] border border-border bg-surface">
                    {list.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTicket(t.id)}
                          className="row-wash flex w-full items-center gap-3 px-4 py-3 text-left"
                        >
                          <span className="hidden w-12 shrink-0 font-mono text-[12px] text-subtle sm:block">
                            #{t.number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                              <span className="truncate">{t.subject}</span>
                              <TicketChannel ticket={t} />
                            </p>
                            <p className="truncate text-[11px] text-subtle">
                              {t.contact?.name ?? "Sem cliente"} ·{" "}
                              {STATUS_LABEL[t.status as TicketStatus]} ·{" "}
                              {formatRelative(t.created_at)}
                            </p>
                          </div>
                          <PriorityPill
                            p={t.priority as TicketPriority}
                            className="hidden md:inline-flex"
                          />
                          <SlaChip ticket={t} className="hidden sm:inline-flex" />
                          <span
                            className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold"
                            title={t.owner_user_id ? names.get(t.owner_user_id) : "Sem responsável"}
                          >
                            {t.owner_user_id ? initials(names.get(t.owner_user_id) ?? "?") : "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <TicketsKanban
                  tickets={matching}
                  names={names}
                  onOpen={onOpenTicket}
                  onMove={move}
                />
              )}
            </TabsContent>
            <TabsContent value="pesquisas" className="mt-4">
              <SurveysPanel accountId={accountId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <NewTicketDialog
        accountId={accountId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => onOpenTicket(id)}
      />
      <TicketSheet accountId={accountId} ticketId={ticketId} onClose={() => onOpenTicket(null)} />
    </div>
  );
}
