import { useState } from "react";
import { ArrowUpRight, CheckCircle2, Layers, Loader2, Plus, Siren } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAccountSlug } from "@/features/support/api";
import type { TicketGroup } from "@/features/support/incident-grouping";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  IMPACT_LABEL,
  INCIDENT_STATUS_LABEL,
  useCreateIncident,
  useIncidentSuggestions,
  useIncidents,
  type IncidentRow,
  type IncidentStatus,
} from "./api";
import { IncidentDetail } from "./IncidentDetail";

// Incidente em massa (direção AIDesigner): lista dos ativos e resolvidos à esquerda, o incidente
// aberto à direita com a situação em passos, o aviso em lote para os afetados e o histórico.
export function IncidentsPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const incidents = useIncidents(accountId);
  const suggest = useIncidentSuggestions(accountId, isManager);
  const slug = useAccountSlug(accountId);
  const [creating, setCreating] = useState<TicketGroup | "blank" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const all = incidents.data ?? [];
  const active = all.filter((i) => i.status !== "resolved");
  const past = all.filter((i) => i.status === "resolved");
  const statusUrl = slug.data ? `/status/${slug.data}` : null;
  const shown = all.find((i) => i.id === picked) ?? active[0] ?? past[0] ?? null;
  const groups = suggest.data?.groups ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="ds-page-header flex shrink-0 flex-wrap items-end gap-3 px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-10">
        <div className="min-w-[200px] flex-1">
          <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
            Resultados
          </p>
          <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[30px]">
            Incidentes
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Muitos clientes com o mesmo problema: um aviso para todos e a página de status
          </p>
        </div>
        {statusUrl && (
          <Button variant="ghost" size="sm" asChild>
            <a href={statusUrl} target="_blank" rel="noopener noreferrer">
              Página de status <ArrowUpRight />
            </a>
          </Button>
        )}
        {isManager && (
          <Button size="sm" onClick={() => setCreating("blank")}>
            <Plus /> Novo incidente
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Lista de incidentes"
          className={cn(
            "min-h-0 w-full shrink-0 flex-col overflow-y-auto border-r border-border bg-background lg:flex lg:w-[400px]",
            picked ? "hidden" : "flex",
          )}
        >
          {isManager && (
            <Suggestions
              isPending={suggest.isPending}
              error={
                suggest.isError
                  ? `Não deu para buscar os chamados parecidos (${errorMessage(suggest.error)}).`
                  : null
              }
              groups={groups}
              onGroup={setCreating}
            />
          )}
          <ListSection
            title={`Incidentes ativos (${active.length})`}
            isPending={incidents.isPending}
            error={incidents.isError ? errorMessage(incidents.error) : null}
            empty={
              <div className="px-5 py-8">
                <p className="flex items-center gap-2 text-[14px] font-semibold">
                  <Siren className="size-4 text-primary" aria-hidden /> Nenhum incidente aberto
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Tudo funcionando. Se algo parar para vários clientes, crie um incidente e avise
                  todos de uma vez.
                </p>
              </div>
            }
            items={active}
            selectedId={shown?.id ?? null}
            onPick={setPicked}
          />
          {past.length > 0 && (
            <ListSection
              title="Resolvidos recentemente"
              isPending={false}
              error={null}
              empty={null}
              items={past.slice(0, 20)}
              selectedId={shown?.id ?? null}
              onPick={setPicked}
            />
          )}
        </aside>

        <section
          aria-label="Incidente aberto"
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col overflow-y-auto",
            picked ? "flex" : "hidden lg:flex",
          )}
        >
          {incidents.isPending ? (
            <div className="space-y-4 p-10">
              <Skeleton className="h-10 w-2/3 rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : shown ? (
            <IncidentDetail
              key={shown.id}
              accountId={accountId}
              incident={shown}
              canEdit={isManager}
              onBack={() => setPicked(null)}
            />
          ) : (
            <EmptyState
              icon={Siren}
              title="Nenhum incidente registrado"
              description="Quando 3 ou mais clientes abrem chamado sobre a mesma coisa, o grupo aparece na lista para virar incidente. Você também pode criar um agora."
              action={
                isManager && (
                  <Button onClick={() => setCreating("blank")}>
                    <Plus /> Novo incidente
                  </Button>
                )
              }
              className="flex-1"
            />
          )}
        </section>
      </div>
      {creating && (
        <CreateIncidentDialog
          accountId={accountId}
          group={creating === "blank" ? null : creating}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}

function Suggestions({
  isPending,
  error,
  groups,
  onGroup,
}: {
  isPending: boolean;
  error: string | null;
  groups: TicketGroup[];
  onGroup: (g: TicketGroup) => void;
}) {
  if (isPending)
    return (
      <div className="border-b border-border p-5">
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  if (error)
    return <p className="border-b border-border px-5 py-4 text-[13px] text-danger">{error}</p>;
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="inc-suggest" className="border-b border-border px-5 py-4">
      <h2 id="inc-suggest" className="eyebrow">
        Chamados parecidos (72 h)
      </h2>
      <ul className="mt-3 space-y-2">
        {groups.map((g) => (
          <li
            key={g.key}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
          >
            <Layers className="size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{g.label}</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {g.tickets.length} chamados · {g.words.join(", ")}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onGroup(g)}>
              Agrupar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListSection({
  title,
  isPending,
  error,
  empty,
  items,
  selectedId,
  onPick,
}: {
  title: string;
  isPending: boolean;
  error: string | null;
  empty: React.ReactNode;
  items: IncidentRow[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <section aria-label={title}>
      <h2 className="eyebrow border-b border-border px-5 py-4">{title}</h2>
      {isPending ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : error ? (
        <p className="px-5 py-4 text-[13px] text-danger">{error}</p>
      ) : items.length === 0 ? (
        empty
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.id} className="border-b border-border">
              <IncidentItem incident={i} selected={i.id === selectedId} onPick={onPick} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IncidentItem({
  incident: i,
  selected,
  onPick,
}: {
  incident: IncidentRow;
  selected: boolean;
  onPick: (id: string) => void;
}) {
  const resolved = i.status === "resolved";
  return (
    <button
      type="button"
      onClick={() => onPick(i.id)}
      data-selected={selected ? "true" : undefined}
      aria-current={selected ? "true" : undefined}
      className="row-wash block w-full px-5 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
    >
      <div className="flex items-start gap-3">
        <p
          className={cn(
            "min-w-0 flex-1 text-[15px] leading-snug",
            resolved ? "text-muted-foreground" : "font-semibold",
          )}
        >
          {i.title}
        </p>
        {resolved ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-label="resolvido" />
        ) : (
          <span className="relative mt-1.5 flex size-2 shrink-0" aria-label="em andamento">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-danger" />
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            !resolved && i.impact === "critical"
              ? "bg-danger/10 text-danger"
              : "bg-surface-2 text-muted-foreground",
          )}
        >
          {i.tickets.length} {i.tickets.length === 1 ? "chamado" : "chamados"}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {INCIDENT_STATUS_LABEL[i.status as IncidentStatus] ?? i.status}
        </span>
        <span className="ml-auto text-[12px] text-subtle">
          {formatRelative(resolved ? (i.resolved_at ?? i.updated_at) : i.started_at)}
        </span>
      </div>
    </button>
  );
}

function CreateIncidentDialog({
  accountId,
  group,
  onClose,
}: {
  accountId: string;
  group: TicketGroup | null;
  onClose: () => void;
}) {
  const create = useCreateIncident(accountId);
  const [title, setTitle] = useState(group?.label ?? "");
  const [impact, setImpact] = useState("major");
  const [isPublic, setIsPublic] = useState(true);
  const [summary, setSummary] = useState("");
  const [selected, setSelected] = useState<string[]>(group?.tickets.map((t) => t.id) ?? []);

  function submit() {
    create.mutate(
      { title, impact, isPublic, summary, ticketIds: selected },
      {
        onSuccess: () => {
          toast.success("Incidente criado");
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo incidente</DialogTitle>
          <DialogDescription>
            Depois de criar, publique uma atualização para avisar todos os clientes de uma vez.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="inc-title">O que está acontecendo</Label>
            <Input
              id="inc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Boleto não está sendo gerado"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Impacto</Label>
              <Select value={impact} onValueChange={setImpact}>
                <SelectTrigger className="h-9" aria-label="Impacto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(IMPACT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-[12px]">
              <Switch
                checked={isPublic}
                onCheckedChange={setIsPublic}
                aria-label="Página de status"
              />
              Mostrar na página de status
            </label>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="inc-summary">Resumo para o cliente (opcional)</Label>
            <Textarea
              id="inc-summary"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          {group && (
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-[12px] font-medium">Chamados do grupo</legend>
              {group.tickets.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1 text-[12px]",
                    selected.includes(t.id) ? "bg-surface-2" : "",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? [...selected, t.id] : selected.filter((x) => x !== t.id),
                      )
                    }
                  />
                  #{t.number} {t.subject}
                </label>
              ))}
            </fieldset>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={create.isPending || title.trim().length < 3}>
            {create.isPending && <Loader2 className="animate-spin" />} Criar incidente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
