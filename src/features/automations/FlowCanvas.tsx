import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";

import { NODE_LABEL, type AutoNode, type Graph } from "./engine";
import { BRANCH_LABEL, BRANCH_TYPES, NODE_ICON, nodeSummary } from "./nodeMeta";

export const TRIGGER_ID = "__trigger";

type StepData = { node: AutoNode; invalid: boolean; isStart: boolean };
type TriggerData = { label: string };

function StepNode({ data, selected }: NodeProps<Node<StepData>>) {
  const n = data.node;
  const Icon = NODE_ICON[n.type];
  const branch = BRANCH_TYPES.includes(n.type);
  const labels = BRANCH_LABEL[n.type];
  return (
    <div
      className={cn(
        "w-[240px] rounded-2xl border bg-surface px-3.5 py-3 transition-shadow",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        data.invalid && "border-danger",
        n.type === "end" && "w-[160px] bg-surface-2",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2.5 !border-2 !border-surface !bg-border-strong"
      />
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg",
            n.type === "end" ? "bg-surface-3 text-muted-foreground" : "bg-[#0A1F3B] text-white",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold">{NODE_LABEL[n.type]}</p>
          {n.type !== "end" && <p className="truncate text-[11px] text-subtle">{nodeSummary(n)}</p>}
        </div>
      </div>
      {data.isStart && (
        <span className="absolute -top-2.5 left-3 rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
          1º passo
        </span>
      )}
      {branch && labels ? (
        <>
          <Handle
            id="yes"
            type="source"
            position={Position.Bottom}
            style={{ left: "28%" }}
            className="!size-2.5 !border-2 !border-surface !bg-primary"
          />
          <Handle
            id="no"
            type="source"
            position={Position.Bottom}
            style={{ left: "72%" }}
            className="!size-2.5 !border-2 !border-surface !bg-muted-foreground"
          />
          <div className="mt-2 flex justify-between px-2 text-[10px] font-medium text-subtle">
            <span>{labels.yes}</span>
            <span>{labels.no}</span>
          </div>
        </>
      ) : (
        n.type !== "end" && (
          <Handle
            id="next"
            type="source"
            position={Position.Bottom}
            className="!size-2.5 !border-2 !border-surface !bg-primary"
          />
        )
      )}
    </div>
  );
}

function TriggerNode({ data, selected }: NodeProps<Node<TriggerData>>) {
  return (
    <div
      className={cn(
        "w-[240px] rounded-2xl bg-[#0A1F3B] px-3.5 py-3 text-white",
        selected && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-white/10">
          <Zap className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.14em] text-white/60 uppercase">
            Gatilho
          </p>
          <p className="truncate text-[12px] font-semibold">{data.label}</p>
        </div>
      </div>
      <Handle
        id="next"
        type="source"
        position={Position.Bottom}
        className="!size-2.5 !border-2 !border-[#0A1F3B] !bg-white"
      />
    </div>
  );
}

const nodeTypes = { step: StepNode, trigger: TriggerNode };

interface Props {
  graph: Graph;
  triggerLabel: string;
  invalidIds: Set<string>;
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onChange: (g: Graph) => void;
}

export function FlowCanvas({
  graph,
  triggerLabel,
  invalidIds,
  selectedId,
  readOnly,
  onSelect,
  onChange,
}: Props) {
  const nodes = useMemo<Node[]>(() => {
    const startPos = graph.start ? graph.nodes[graph.start]?.position : undefined;
    const trig: Node<TriggerData> = {
      id: TRIGGER_ID,
      type: "trigger",
      position: { x: startPos?.x ?? 260, y: (startPos?.y ?? 140) - 120 },
      data: { label: triggerLabel },
      draggable: false,
      selected: selectedId === TRIGGER_ID,
    };
    return [
      trig,
      ...Object.values(graph.nodes).map<Node<StepData>>((n) => ({
        id: n.id,
        type: "step",
        position: n.position ?? { x: 260, y: 140 },
        data: { node: n, invalid: invalidIds.has(n.id), isStart: graph.start === n.id },
        selected: selectedId === n.id,
        deletable: !readOnly,
      })),
    ];
  }, [graph, triggerLabel, invalidIds, selectedId, readOnly]);

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const style = { strokeWidth: 1.75 };
    const marker = { type: MarkerType.ArrowClosed, width: 16, height: 16 };
    if (graph.start)
      out.push({
        id: `e-trigger`,
        source: TRIGGER_ID,
        sourceHandle: "next",
        target: graph.start,
        style,
        markerEnd: marker,
        deletable: false,
      });
    for (const n of Object.values(graph.nodes)) {
      if (n.next)
        out.push({
          id: `e-${n.id}-next`,
          source: n.id,
          sourceHandle: "next",
          target: n.next,
          style,
          markerEnd: marker,
        });
      const labels = BRANCH_LABEL[n.type];
      if (n.yes)
        out.push({
          id: `e-${n.id}-yes`,
          source: n.id,
          sourceHandle: "yes",
          target: n.yes,
          label: labels?.yes,
          style,
          markerEnd: marker,
        });
      if (n.no)
        out.push({
          id: `e-${n.id}-no`,
          source: n.id,
          sourceHandle: "no",
          target: n.no,
          label: labels?.no,
          style: { ...style, strokeDasharray: "5 4" },
          markerEnd: marker,
        });
    }
    return out;
  }, [graph]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      let next = graph;
      let changed = false;
      for (const ch of changes) {
        if (ch.type === "position" && ch.position && ch.id !== TRIGGER_ID && next.nodes[ch.id]) {
          next = {
            ...next,
            nodes: { ...next.nodes, [ch.id]: { ...next.nodes[ch.id]!, position: ch.position } },
          };
          changed = true;
        } else if (ch.type === "remove" && !readOnly && ch.id !== TRIGGER_ID && next.nodes[ch.id]) {
          const { [ch.id]: _removed, ...rest } = next.nodes;
          const cleaned = Object.fromEntries(
            Object.entries(rest).map(([k, v]) => [
              k,
              {
                ...v,
                next: v.next === ch.id ? null : (v.next ?? null),
                yes: v.yes === ch.id ? null : (v.yes ?? null),
                no: v.no === ch.id ? null : (v.no ?? null),
              },
            ]),
          );
          next = { start: next.start === ch.id ? null : next.start, nodes: cleaned };
          changed = true;
        } else if (ch.type === "select" && ch.selected) {
          onSelect(ch.id);
        }
      }
      if (changed) onChange(next);
    },
    [graph, onChange, onSelect, readOnly],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (readOnly) return;
      let next = graph;
      for (const ch of changes) {
        if (ch.type !== "remove") continue;
        const m = /^e-(.+)-(next|yes|no)$/.exec(ch.id);
        if (!m) continue;
        const [, id, handle] = m;
        const n = next.nodes[id!];
        if (n) next = { ...next, nodes: { ...next.nodes, [id!]: { ...n, [handle!]: null } } };
      }
      if (next !== graph) onChange(next);
    },
    [graph, onChange, readOnly],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.target || c.target === TRIGGER_ID) return;
      if (c.source === TRIGGER_ID) {
        onChange({ ...graph, start: c.target });
        return;
      }
      const n = graph.nodes[c.source];
      if (!n || c.source === c.target) return;
      const handle = (c.sourceHandle ?? "next") as "next" | "yes" | "no";
      onChange({ ...graph, nodes: { ...graph.nodes, [n.id]: { ...n, [handle]: c.target } } });
    },
    [graph, onChange, readOnly],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onPaneClick={() => onSelect(null)}
      nodesConnectable={!readOnly}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      minZoom={0.3}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      className="bg-surface-2/40"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
      <MiniMap
        pannable
        zoomable
        nodeColor="#0A1F3B"
        nodeBorderRadius={8}
        maskColor="rgba(10, 31, 59, 0.06)"
        className="hidden !rounded-xl !border !border-border !bg-surface md:block"
      />
      <Controls
        showInteractive={false}
        className="!rounded-xl !border !border-border !shadow-card"
      />
    </ReactFlow>
  );
}
