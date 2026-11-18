import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useSaveStages, type StageDraft } from "../api";
import { STAGE_COLORS, STAGE_COLOR_LABEL, stageBarClass } from "../stageColors";
import type { Stage } from "../types";
import { countLabel } from "@/lib/plural";

const KIND_LABEL: Record<string, string> = {
  open: "Na carteira",
  won: "Fidelizado",
  lost: "Perdido",
};

type Props = {
  accountId: string;
  pipelineId: string;
  pipelineName: string;
  stages: Stage[];
  dealCount: (stageId: string) => number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function toDrafts(stages: Stage[]): StageDraft[] {
  return stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    probability: s.probability,
    kind: s.kind,
  }));
}

export function PipelineSettingsDialog({ open, onOpenChange, stages, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && (
          <Editor
            key={stages.map((s) => s.id).join()}
            stages={stages}
            onDone={() => onOpenChange(false)}
            {...rest}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  accountId,
  pipelineId,
  pipelineName,
  stages,
  dealCount,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const save = useSaveStages(accountId, pipelineId);
  const [drafts, setDrafts] = useState<StageDraft[]>(() => toDrafts(stages));
  const [removed, setRemoved] = useState<string[]>([]);

  const patch = (i: number, p: Partial<StageDraft>) =>
    setDrafts((list) => list.map((d, idx) => (idx === i ? { ...d, ...p } : d)));
  const move = (i: number, dir: -1 | 1) =>
    setDrafts((list) => {
      const j = i + dir;
      const a = list[i];
      const b = list[j];
      if (!a || !b) return list;
      return list.map((d, idx) => (idx === i ? b : idx === j ? a : d));
    });
  const remove = (i: number) => {
    const d = drafts[i];
    if (!d) return;
    if (d.id) setRemoved((r) => [...r, d.id as string]);
    setDrafts((list) => list.filter((_, idx) => idx !== i));
  };

  const problem = drafts.some((d) => !d.name.trim())
    ? "Toda etapa precisa de nome."
    : !drafts.some((d) => d.kind === "open")
      ? "A jornada precisa de ao menos uma etapa aberta."
      : null;

  async function submit() {
    if (problem) return;
    try {
      await save.mutateAsync({ drafts, removed });
      toast.success("Jornada atualizada");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Configurar jornada</DialogTitle>
        <DialogDescription>
          {pipelineName}. A porcentagem é a chance de o cliente continuar com você naquela etapa. Só
          dá para remover etapa vazia.
        </DialogDescription>
      </DialogHeader>
      <ol className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {drafts.map((d, i) => {
          const count = d.id ? dealCount(d.id) : 0;
          return (
            <li
              key={d.id ?? `new-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2"
            >
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-6"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Subir ${d.name}`}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-6"
                  onClick={() => move(i, 1)}
                  disabled={i === drafts.length - 1}
                  aria-label={`Descer ${d.name}`}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </div>
              <Select value={d.color} onValueChange={(color) => patch(i, { color })}>
                <SelectTrigger className="h-9 w-[72px]" aria-label="Cor da etapa">
                  <span className={cn("size-3 rounded-full", stageBarClass(d.color))} aria-hidden />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_COLORS.map((c) => (
                    <SelectItem key={c} value={c}>
                      <span className="flex items-center gap-2">
                        <span className={cn("size-3 rounded-full", stageBarClass(c))} aria-hidden />
                        {STAGE_COLOR_LABEL[c]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={d.name}
                onChange={(e) => patch(i, { name: e.target.value.slice(0, 60) })}
                className="h-9 min-w-32 flex-1"
                aria-label="Nome da etapa"
                aria-invalid={!d.name.trim()}
              />
              <label className="flex items-center gap-1 text-[12px] text-subtle">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={d.probability}
                  onChange={(e) =>
                    patch(i, {
                      probability: Math.max(
                        0,
                        Math.min(100, Math.round(Number(e.target.value) || 0)),
                      ),
                    })
                  }
                  className="h-9 w-16 tabular-nums"
                  aria-label="Chance de continuar cliente, em porcentagem"
                />
                %
              </label>
              <Select value={d.kind} onValueChange={(kind) => patch(i, { kind })}>
                <SelectTrigger className="h-9 w-36" aria-label="Tipo da etapa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                disabled={count > 0}
                title={
                  count > 0
                    ? `Tem ${countLabel(count, "cliente")}. Mova antes de remover.`
                    : "Remover etapa"
                }
                aria-label={
                  count > 0 ? `${d.name} tem clientes e não pode ser removida` : `Remover ${d.name}`
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() =>
          setDrafts((list) => [
            ...list,
            { id: null, name: "Nova etapa", color: "slate", probability: 50, kind: "open" },
          ])
        }
      >
        <Plus aria-hidden /> Adicionar etapa
      </Button>
      {problem && <p className="text-[12px] text-danger">{problem}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={Boolean(problem) || save.isPending}
        >
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Salvar jornada
        </Button>
      </DialogFooter>
    </>
  );
}
