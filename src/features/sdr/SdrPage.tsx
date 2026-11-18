import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  CalendarClock,
  Check,
  CornerDownRight,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { usePublicSlots } from "@/features/booking/api";
import { SlotPicker } from "@/features/booking/SlotPicker";
import { useTeamMembers } from "@/features/contacts/api";
import { useAccount } from "@/lib/account";
import { formatRelative, initials } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useDeleteRule,
  useLeadModel,
  useRoutingRules,
  useSaveRule,
  useScoredLeads,
  useSimulateRoute,
  useTrainModel,
  type RoutingRuleRow,
  type RuleDraft,
  type SimulateResult,
} from "./api";
import { nextInRotation, ruleCondition } from "./insights";
import type { RoutingMatch } from "./routing";
import { SdrScoring } from "./SdrScoring";

// Pontuação e rodízio (direção AIDesigner): à esquerda como a nota é feita, o melhor horário e os
// leads com mais chance; à direita as regras de atribuição em ordem, o rodízio e o teste com um lead.
export function SdrPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const model = useLeadModel(accountId);
  const leads = useScoredLeads(accountId);
  const trainM = useTrainModel(accountId);
  const team = useTeamMembers(accountId);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const metrics = (model.data?.metrics ?? {}) as { accuracy?: number | null };
  const trained = Boolean(model.data && metrics.accuracy != null);

  function train() {
    trainM.mutate(undefined, {
      onSuccess: (r) =>
        r.trained
          ? toast.success(`Modelo treinado com ${r.samples} negócios · ${r.scored} leads com nota`)
          : toast.info(r.reason || "Ainda não há histórico suficiente"),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 pb-16 md:px-10 md:pt-12">
        <header className="flex flex-wrap items-end gap-x-8 gap-y-5">
          <div className="min-w-[240px] flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              {model.isPending ? (
                <Skeleton className="h-5 w-40 rounded-full" />
              ) : trained ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground">
                    <Check className="size-3 text-foreground" aria-hidden /> Modelo treinado
                  </span>
                  Atualizado {formatRelative(model.data!.trained_at)}
                </>
              ) : (
                <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium">
                  Modelo ainda não treinado
                </span>
              )}
            </p>
            <p className="mt-3 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Configuração
            </p>
            <h1 className="mt-1.5 font-display text-[30px] leading-tight font-medium md:text-[34px]">
              Pontuação e rodízio
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              A chance de fechar de cada lead, aprendida com os seus ganhos e perdas, e quem da
              equipe recebe cada lead novo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="#testar-lead">Testar um lead</a>
            </Button>
            {isManager && (
              <Button onClick={train} disabled={trainM.isPending}>
                {trainM.isPending ? <Loader2 className="animate-spin" /> : <Brain />} Treinar agora
              </Button>
            )}
          </div>
        </header>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
          <SdrScoring
            model={model.data}
            modelPending={model.isPending}
            leads={leads.data ?? []}
            leadsPending={leads.isPending}
            leadsError={leads.isError ? leads.error : null}
            ownerName={(id) => (id ? (names.get(id) ?? "") : "sem dono")}
          />
          <RoutingColumn accountId={accountId} isManager={isManager} names={names} />
        </div>
      </div>
    </div>
  );
}

function RoutingColumn({
  accountId,
  isManager,
  names,
}: {
  accountId: string;
  isManager: boolean;
  names: Map<string, string>;
}) {
  const rules = useRoutingRules(accountId);
  const team = useTeamMembers(accountId);
  const save = useSaveRule(accountId);
  const del = useDeleteRule(accountId);
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const list = rules.data ?? [];
  const newRule = () =>
    setEditing({
      name: "",
      match: {},
      mode: "round_robin",
      user_ids: [],
      is_active: true,
      position: list.length,
    });

  function move(r: RoutingRuleRow, dir: -1 | 1) {
    const i = list.findIndex((x) => x.id === r.id);
    const other = list[i + dir];
    if (!other) return;
    // Troca as posições (índice como posição, para não depender de valores repetidos).
    const a = { ...r, position: i + dir };
    const b = { ...other, position: i };
    Promise.all([save.mutateAsync(toDraft(a)), save.mutateAsync(toDraft(b))]).catch((e: unknown) =>
      toast.error(errorMessage(e)),
    );
  }

  return (
    <div className="grid content-start gap-10">
      <section aria-labelledby="sdr-rules">
        <div className="mb-4 flex items-center gap-2.5">
          <GitBranch className="size-[18px] text-subtle" aria-hidden />
          <h2 id="sdr-rules" className="flex-1 font-display text-[19px] font-medium">
            Regras de atribuição
          </h2>
        </div>
        <p className="mb-4 text-[13px] text-muted-foreground">
          A primeira regra que combina com o lead decide. Lead que já tem dono não muda.
        </p>
        {rules.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : rules.isError ? (
          <p className="text-[13px] text-danger">{errorMessage(rules.error)}</p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={RouteIcon}
            title="Crie a primeira regra de distribuição"
            description="Sem regra, lead novo fica sem dono até alguém assumir. Crie uma por estado, cidade, segmento ou em rodízio entre os vendedores."
            action={
              isManager && (
                <Button variant="outline" onClick={newRule}>
                  <Plus /> Criar a primeira regra
                </Button>
              )
            }
            className="rounded-xl border border-border bg-surface"
          />
        ) : (
          <ol className="grid gap-4">
            {list.map((r, i) => (
              <RuleCard
                key={r.id}
                rule={r}
                index={i}
                total={list.length}
                names={names}
                canEdit={isManager}
                onMove={(dir) => move(r, dir)}
                onEdit={() => setEditing(toDraft(r))}
                onDelete={() =>
                  del.mutate(r.id, {
                    onSuccess: () => toast.success("Regra apagada"),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              />
            ))}
          </ol>
        )}
        {isManager && list.length > 0 && (
          <button
            type="button"
            onClick={newRule}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-[14px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]"
          >
            <Plus className="size-4" aria-hidden /> Adicionar nova regra
          </button>
        )}
      </section>
      <Simulator accountId={accountId} names={names} enabled={isManager} />
      {editing && (
        <RuleDialog
          accountId={accountId}
          draft={editing}
          team={(team.data ?? []).map((m) => ({ id: m.userId, name: m.name }))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RuleCard({
  rule: r,
  index,
  total,
  names,
  canEdit,
  onMove,
  onEdit,
  onDelete,
}: {
  rule: RoutingRuleRow;
  index: number;
  total: number;
  names: Map<string, string>;
  canEdit: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const condition = ruleCondition(r.match);
  const next = nextInRotation(r);
  const people = r.user_ids.map((u) => names.get(u) ?? "Vendedor");
  return (
    <li
      className={cn("rounded-xl border border-border bg-surface p-5", !r.is_active && "opacity-60")}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border text-[12px] font-semibold tabular-nums">
          {index + 1}
        </span>
        <p className="min-w-0 flex-1 pt-0.5 text-[15px] font-semibold">{r.name}</p>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {!r.is_active ? "Pausada" : r.mode === "user" ? "Vendedor fixo" : "Rodízio"}
        </span>
      </div>
      <div className="mt-3 pl-10">
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
          {condition ?? "Qualquer lead que não caiu nas regras de cima"}
        </p>
        <p className="mt-3 flex items-start gap-1.5 text-[13px] text-muted-foreground">
          <CornerDownRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {r.mode === "user" ? "Vai para " : "Rodízio entre "}
            <span className="font-medium text-foreground">
              {people.length ? people.join(", ") : "ninguém (escolha vendedores)"}
            </span>
          </span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
          {r.mode !== "user" && people.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="flex -space-x-1.5" aria-hidden>
                {r.user_ids.slice(0, 5).map((u) => (
                  <span
                    key={u}
                    className={cn(
                      "grid size-6 place-items-center rounded-full border-2 border-surface text-[9px] font-semibold",
                      u === next ? "bg-primary text-primary-foreground" : "bg-surface-3",
                    )}
                  >
                    {initials(names.get(u))}
                  </span>
                ))}
              </span>
              {next && <span>Próximo: {names.get(next) ?? "vendedor"}</span>}
            </span>
          )}
          <span className="tabular-nums">
            {r.routed_count} {r.routed_count === 1 ? "lead distribuído" : "leads distribuídos"}
          </span>
        </div>
      </div>
      {canEdit && (
        <div className="mt-3 flex justify-end gap-0.5 border-t border-border pt-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Subir"
            onClick={() => onMove(-1)}
            disabled={index === 0}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Descer"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
          >
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Editar ${r.name}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Apagar ${r.name}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

function toDraft(r: RoutingRuleRow): RuleDraft {
  return {
    id: r.id,
    name: r.name,
    match: r.match,
    mode: r.mode as RuleDraft["mode"],
    user_ids: r.user_ids,
    is_active: r.is_active,
    position: r.position,
  };
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);

function RuleDialog({
  accountId,
  draft,
  team,
  onClose,
}: {
  accountId: string;
  draft: RuleDraft;
  team: { id: string; name: string }[];
  onClose: () => void;
}) {
  const save = useSaveRule(accountId);
  const [d, setD] = useState(draft);
  const field = (k: keyof RoutingMatch) => (d.match[k] ?? []).join(", ");
  const setField = (k: keyof RoutingMatch, v: string) => {
    const list = splitList(v);
    setD({
      ...d,
      match: {
        ...d.match,
        [k]: k === "states" ? list.map((x) => x.toUpperCase().slice(0, 2)) : list,
      },
    });
  };

  function submit() {
    save.mutate(d, {
      onSuccess: () => {
        toast.success("Regra salva");
        onClose();
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.id ? "Editar regra" : "Nova regra de roteamento"}</DialogTitle>
          <DialogDescription>
            Deixe em branco o que não importa. Separe vários valores por vírgula.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="rr-name">Nome da regra</Label>
            <Input
              id="rr-name"
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder="Ex.: Sudeste para o time SP"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Estados (UF)"
              placeholder="SP, RJ"
              value={field("states")}
              onChange={(v) => setField("states", v)}
            />
            <TextField
              label="Cidades"
              placeholder="Campinas"
              value={field("cities")}
              onChange={(v) => setField("cities", v)}
            />
            <TextField
              label="Segmento"
              placeholder="saúde, varejo"
              value={field("segments")}
              onChange={(v) => setField("segments", v)}
            />
            <TextField
              label="Origem"
              placeholder="form, meta_ads"
              value={field("sources")}
              onChange={(v) => setField("sources", v)}
            />
            <TextField
              label="Porte"
              placeholder="pequena, média"
              value={field("sizes")}
              onChange={(v) => setField("sizes", v)}
            />
          </div>
          <div className="grid gap-1">
            <Label>Como distribuir</Label>
            <div className="flex gap-2">
              {(["round_robin", "user"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setD({ ...d, mode: m })}
                  aria-pressed={d.mode === m}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] active:scale-[0.98]",
                    d.mode === m
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {m === "round_robin" ? "Rodízio entre vendedores" : "Sempre o mesmo vendedor"}
                </button>
              ))}
            </div>
          </div>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-[13px] font-medium">Vendedores</legend>
            {team.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type={d.mode === "user" ? "radio" : "checkbox"}
                  name="rr-users"
                  checked={d.user_ids.includes(m.id)}
                  onChange={(e) =>
                    setD({
                      ...d,
                      user_ids:
                        d.mode === "user"
                          ? [m.id]
                          : e.target.checked
                            ? [...d.user_ids, m.id]
                            : d.user_ids.filter((x) => x !== m.id),
                    })
                  }
                />
                {m.name}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch
              checked={d.is_active}
              onCheckedChange={(v) => setD({ ...d, is_active: v })}
              aria-label="Regra ativa"
            />
            Regra ativa
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={save.isPending || !d.name.trim() || d.user_ids.length === 0}
          >
            {save.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <div className="grid gap-1">
      <Label className="text-[12px]">{label}</Label>
      <Input
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onChange(v)}
        aria-label={label}
      />
    </div>
  );
}

// Teste do roteamento com a agenda do vendedor escolhido na mesma tela.
function Simulator({
  accountId,
  names,
  enabled,
}: {
  accountId: string;
  names: Map<string, string>;
  enabled: boolean;
}) {
  const sim = useSimulateRoute(accountId);
  const [lead, setLead] = useState({ state: "", city: "", segment: "", source: "", size: "" });
  const [result, setResult] = useState<SimulateResult | null>(null);

  function run() {
    sim.mutate(lead, {
      onSuccess: setResult,
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <section
      id="testar-lead"
      aria-labelledby="sdr-sim"
      className="grid scroll-mt-6 content-start gap-3 rounded-xl border border-border bg-surface p-5"
    >
      <div>
        <h2 id="sdr-sim" className="text-[15px] font-medium">
          Testar com um lead
        </h2>
        <p className="text-[12px] text-muted-foreground">
          Preencha o que souber e veja para quem ele iria, com a agenda livre do vendedor.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="UF"
          value={lead.state}
          onChange={(e) => setLead({ ...lead, state: e.target.value })}
          aria-label="Estado"
        />
        <Input
          placeholder="Cidade"
          value={lead.city}
          onChange={(e) => setLead({ ...lead, city: e.target.value })}
          aria-label="Cidade"
        />
        <Input
          placeholder="Segmento"
          value={lead.segment}
          onChange={(e) => setLead({ ...lead, segment: e.target.value })}
          aria-label="Segmento"
        />
        <Input
          placeholder="Origem"
          value={lead.source}
          onChange={(e) => setLead({ ...lead, source: e.target.value })}
          aria-label="Origem"
        />
      </div>
      <Button variant="outline" onClick={run} disabled={!enabled || sim.isPending}>
        {sim.isPending ? <Loader2 className="animate-spin" /> : <RouteIcon />} Testar
      </Button>
      {result &&
        (result.userId ? (
          <div className="grid gap-2">
            <p className="text-[13px]">
              Vai para{" "}
              <span className="font-semibold">{names.get(result.userId) ?? "vendedor"}</span>{" "}
              <span className="text-muted-foreground">pela regra “{result.ruleName}”</span>
            </p>
            {result.bookingSlug ? (
              <AgendaPreview slug={result.bookingSlug} />
            ) : (
              <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">
                <CalendarClock className="size-4" aria-hidden /> Este vendedor ainda não tem página
                de agendamento. Crie em Agendamentos para o lead marcar na hora.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">
            Nenhuma regra combina com este lead. Ele fica sem dono até alguém assumir.
          </p>
        ))}
    </section>
  );
}

function AgendaPreview({ slug }: { slug: string }) {
  const slots = usePublicSlots(slug, true);
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-1 text-[12px] text-muted-foreground">Horários livres desse vendedor</p>
      <SlotPicker
        slots={slots.data?.slots ?? []}
        tz={slots.data?.timeZone ?? "America/Sao_Paulo"}
        pending={slots.isPending}
        onPick={() => window.open(`/agendar/${slug}`, "_blank", "noopener")}
      />
    </div>
  );
}
