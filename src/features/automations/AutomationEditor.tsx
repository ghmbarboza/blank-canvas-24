import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  FlaskConical,
  Loader2,
  Pause,
  Play,
  Plus,
  Save,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWhatsAppPricing } from "@/features/inbox/useWhatsAppPricing";
import { flowCostPerContact, formatUnitBRL } from "@/features/inbox/whatsapp-pricing";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useAutomation, useAutomationAction, useSaveAutomation, type Automation } from "./api";
import { FlowCanvas, TRIGGER_ID } from "./FlowCanvas";
import {
  NODE_LABEL,
  newNodeId,
  nodeConfigErrors,
  validateGraph,
  type AutoNode,
  type Graph,
  type NodeType,
} from "./engine";
import { NODE_ICON, PALETTE } from "./nodeMeta";
import { ArchiveAutomationButton } from "./ArchiveAutomationButton";
import { NodePanel } from "./NodePanel";
import { RunsPanel } from "./RunsPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SimulateDialog } from "./SimulateDialog";
import { triggerSummary } from "./triggerSummary";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
  archived: "Arquivada",
};

export function AutomationEditor({ automationId }: { automationId: string }) {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const query = useAutomation(automationId);
  const save = useSaveAutomation(accountId);
  const action = useAutomationAction(accountId);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Automation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const waPricing = useWhatsAppPricing();

  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data);
  }, [query.data, dirty]);

  const errors = useMemo(() => (draft ? validateGraph(draft.graph) : []), [draft]);
  const invalidIds = useMemo(
    () =>
      new Set(
        draft
          ? Object.values(draft.graph.nodes)
              .filter((n) => nodeConfigErrors(n).length > 0)
              .map((n) => n.id)
          : [],
      ),
    [draft],
  );

  if (query.isPending || (!draft && query.data)) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-[60dvh] w-full rounded-[24px]" />
      </div>
    );
  }
  if (!draft) {
    return (
      <EmptyState
        icon={Workflow}
        title="Automação não encontrada"
        action={
          <Button asChild variant="outline">
            <Link to="/automacoes">Voltar</Link>
          </Button>
        }
      />
    );
  }

  const readOnly = !isManager;
  // Soma todos os passos de WhatsApp com modelo: com ramificações, é o teto por contato.
  const waCost = flowCostPerContact(waPricing, Object.values(draft.graph.nodes));
  const update = (patch: Partial<Automation>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const setGraph = (g: Graph) => update({ graph: g });
  const selectedNode = selected && selected !== TRIGGER_ID ? draft.graph.nodes[selected] : null;

  function addNode(type: NodeType) {
    if (!draft) return;
    const id = newNodeId();
    const base =
      selectedNode ?? (draft.graph.start ? draft.graph.nodes[draft.graph.start] : undefined);
    const pos = base?.position ?? { x: 260, y: 140 };
    const node: AutoNode = {
      id,
      type,
      config: defaultConfig(type),
      position: { x: pos.x, y: pos.y + 130 },
    };
    const nodes = { ...draft.graph.nodes, [id]: node };
    // Insere depois do passo selecionado, mantendo o que vinha depois.
    if (
      selectedNode &&
      !["condition", "wait_event", "ab_split", "end"].includes(selectedNode.type)
    ) {
      node.next = selectedNode.next ?? null;
      nodes[selectedNode.id] = { ...selectedNode, next: id };
      // empurra para baixo o que vem depois, para não sobrepor
      for (const n of Object.values(nodes))
        if (n.id !== id && n.position && n.position.y > pos.y)
          nodes[n.id] = { ...n, position: { x: n.position.x, y: n.position.y + 130 } };
    }
    if (node.type === "condition" || node.type === "wait_event" || node.type === "ab_split") {
      node.config = defaultConfig(type);
    }
    setGraph({ start: draft.graph.start ?? id, nodes });
    setSelected(id);
  }

  async function persist(): Promise<boolean> {
    if (!draft) return false;
    try {
      const saved = await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        kind: draft.kind,
        trigger: draft.trigger,
        graph: draft.graph,
        exit_rules: draft.exit_rules,
        guards: draft.guards,
        reentry: draft.reentry,
      });
      setDraft(saved);
      setDirty(false);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  }

  async function toggleActive() {
    if (!draft) return;
    if (dirty && !(await persist())) return;
    action.mutate(
      { action: draft.status === "active" ? "pause" : "activate", automationId: draft.id },
      {
        onSuccess: () => {
          toast.success(
            draft.status === "active"
              ? "Automação pausada. Quem estava andando fica parado até reativar."
              : waCost > 0
                ? `Automação ativa. WhatsApp: até ${formatUnitBRL(waCost)} por contato que passar pelo fluxo.`
                : "Automação ativa",
          );
          setDraft((d) => (d ? { ...d, status: d.status === "active" ? "paused" : "active" } : d));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="atmosphere flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
        <Link
          to="/automacoes"
          className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-foreground"
          aria-label="Voltar para automações"
        >
          <ArrowLeft className="size-4" />
        </Link>
        {/* Editor em tela cheia (exceção documentada à moldura): o nome editável fica no topo,
            e o h1 oculto dá o título da página ao leitor de tela. */}
        <h1 className="sr-only">Automação: {draft.name}</h1>
        <Input
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          disabled={readOnly}
          className="h-9 max-w-sm border-transparent bg-transparent font-display text-[18px] font-semibold shadow-none hover:border-border focus:border-border"
          aria-label="Nome da automação"
        />
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium",
            draft.status === "active"
              ? "bg-primary-soft text-foreground"
              : "bg-surface-2 text-muted-foreground",
          )}
        >
          {STATUS_LABEL[draft.status]}
        </span>
        {dirty && <span className="text-[12px] text-subtle">alterações não salvas</span>}
        {waCost > 0 && (
          <span
            className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-muted-foreground"
            title="Preço dos modelos de WhatsApp do fluxo, pela tabela em Canais. Com caminhos alternativos, é o máximo."
          >
            WhatsApp: até {formatUnitBRL(waCost)} por contato
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSimulating(true)}>
            <FlaskConical /> Simular
          </Button>
          {!readOnly && (
            <>
              <ArchiveAutomationButton
                accountId={accountId}
                automationId={draft.id}
                name={draft.name}
                active={draft.status === "active"}
                onArchived={() => void navigate({ to: "/automacoes" })}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!dirty || save.isPending}
                onClick={() => void persist().then((ok) => ok && toast.success("Salvo"))}
              >
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
              </Button>
              <Button
                size="sm"
                disabled={action.isPending || (draft.status !== "active" && errors.length > 0)}
                onClick={() => void toggleActive()}
                title={errors.length ? errors.join(" · ") : undefined}
              >
                {action.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : draft.status === "active" ? (
                  <Pause />
                ) : (
                  <Play />
                )}
                {draft.status === "active" ? "Pausar" : "Ativar"}
              </Button>
            </>
          )}
        </div>
      </header>

      <Tabs defaultValue="flow" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-fit sm:mx-6">
          <TabsTrigger value="flow">Fluxo</TabsTrigger>
          <TabsTrigger value="settings">Gatilho e regras</TabsTrigger>
          <TabsTrigger value="runs">
            <Users className="mr-1 size-3.5" /> Inscritos e histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="m-0 flex min-h-0 flex-1 flex-col">
          {errors.length > 0 && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger sm:mx-6">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{errors.join(" · ")}</span>
            </div>
          )}
          <div className="flex min-h-[520px] flex-1 flex-col gap-3 p-4 sm:p-6 lg:flex-row">
            {!readOnly && (
              <aside
                className="shrink-0 rounded-[24px] border border-border bg-surface p-3 lg:w-56 lg:overflow-y-auto"
                aria-label="Passos disponíveis"
              >
                <p className="eyebrow px-1 pb-2">Adicionar passo</p>
                <p className="px-1 pb-3 text-[11px] text-subtle">
                  {selectedNode
                    ? `Entra depois de "${NODE_LABEL[selectedNode.type]}"`
                    : "Clique para adicionar e ligue arrastando os pontos."}
                </p>
                <div className="flex flex-wrap gap-1.5 lg:block lg:space-y-3">
                  {PALETTE.map((g) => (
                    <div key={g.group}>
                      <p className="hidden px-1 pb-1 text-[10px] font-medium tracking-wide text-subtle uppercase lg:block">
                        {g.group}
                      </p>
                      <div className="flex flex-wrap gap-1.5 lg:block lg:space-y-0.5">
                        {g.types.map((t) => {
                          const Icon = NODE_ICON[t];
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => addNode(t)}
                              className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-1.5 text-[12px] hover:bg-surface-2 lg:w-full lg:border-transparent"
                            >
                              <Icon className="size-3.5 text-subtle" /> {NODE_LABEL[t]}
                              <Plus className="ml-auto hidden size-3 text-subtle lg:block" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            )}
            <div className="relative min-h-[460px] flex-1 overflow-hidden rounded-[24px] border border-border">
              <FlowCanvas
                graph={draft.graph}
                triggerLabel={triggerSummary(draft.trigger)}
                invalidIds={invalidIds}
                selectedId={selected}
                readOnly={readOnly}
                onSelect={setSelected}
                onChange={setGraph}
              />
            </div>
            <aside
              className="shrink-0 overflow-hidden rounded-[24px] border border-border bg-surface lg:w-80"
              aria-label="Propriedades"
            >
              {selectedNode ? (
                <NodePanel
                  accountId={accountId}
                  node={selectedNode}
                  isStart={draft.graph.start === selectedNode.id}
                  readOnly={readOnly}
                  onChange={(n) =>
                    setGraph({ ...draft.graph, nodes: { ...draft.graph.nodes, [n.id]: n } })
                  }
                  onMakeStart={() => setGraph({ ...draft.graph, start: selectedNode.id })}
                  onDelete={() => {
                    const { [selectedNode.id]: _gone, ...rest } = draft.graph.nodes;
                    const relinked = Object.fromEntries(
                      Object.entries(rest).map(([k, v]) => [
                        k,
                        {
                          ...v,
                          next:
                            v.next === selectedNode.id
                              ? (selectedNode.next ?? null)
                              : (v.next ?? null),
                          yes:
                            v.yes === selectedNode.id
                              ? (selectedNode.next ?? null)
                              : (v.yes ?? null),
                          no:
                            v.no === selectedNode.id ? (selectedNode.next ?? null) : (v.no ?? null),
                        },
                      ]),
                    );
                    setGraph({
                      start:
                        draft.graph.start === selectedNode.id
                          ? (selectedNode.next ?? null)
                          : draft.graph.start,
                      nodes: relinked,
                    });
                    setSelected(null);
                  }}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <Workflow className="size-6 text-subtle" />
                  <p className="text-[13px] font-medium">Selecione um passo</p>
                  <p className="text-[12px] text-muted-foreground">
                    Clique num passo do fluxo para editar. O gatilho fica na aba “Gatilho e regras”.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="m-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <SettingsPanel
            accountId={accountId}
            automation={draft}
            readOnly={readOnly}
            onChange={update}
          />
        </TabsContent>

        <TabsContent value="runs" className="m-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <RunsPanel accountId={accountId} automation={draft} />
        </TabsContent>
      </Tabs>

      <SimulateDialog
        accountId={accountId}
        automationId={draft.id}
        dirty={dirty}
        open={simulating}
        onOpenChange={setSimulating}
        onSaveFirst={persist}
      />
    </div>
  );
}

function defaultConfig(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "wait":
      return { minutes: 1440 };
    case "wait_event":
      return { event: "replied", timeout_minutes: 1440 };
    case "condition":
      return { kind: "replied" };
    case "ab_split":
      return { percent_a: 50 };
    case "email":
      return { category: "marketing", subject: "", body: "" };
    case "whatsapp":
      return { category: "marketing", text: "", template_language: "pt_BR" };
    case "task":
      return { type: "call", due_in_minutes: 60, title: "" };
    case "ticket":
      return { subject: "", priority: "high" };
    case "ai_toggle":
      return { enabled: false };
    default:
      return {};
  }
}
