import { useState } from "react";
import { GripVertical, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useQualityAction, type QualityForm } from "./api";
import { CHANNEL_LABEL, type QualityChannel, type QualityCriterion } from "./scoring";

type Draft = {
  id?: string | undefined;
  name: string;
  description: string;
  channels: QualityChannel[];
  include_ai: boolean;
  is_active: boolean;
  criteria: QualityCriterion[];
};

function toDraft(f: QualityForm | null): Draft {
  if (!f)
    return {
      name: "",
      description: "",
      channels: ["call", "chat", "email"],
      include_ai: true,
      is_active: true,
      criteria: [{ id: "", label: "", description: "", weight: 3, eliminatory: false }],
    };
  return {
    id: f.id,
    name: f.name,
    description: f.description ?? "",
    channels: f.channels,
    include_ai: f.include_ai,
    is_active: f.is_active,
    criteria: f.criteria,
  };
}

// Editor do formulário de qualidade: critérios com peso e itens obrigatórios (eliminatórios).
export function FormEditorDialog({
  accountId,
  form,
  open,
  onOpenChange,
}: {
  accountId: string;
  form: QualityForm | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(form));
  const save = useQualityAction<{ id: string }>(accountId);

  const setCrit = (i: number, patch: Partial<QualityCriterion>) =>
    setD({ ...d, criteria: d.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const toggleChannel = (c: QualityChannel) =>
    setD({
      ...d,
      channels: d.channels.includes(c) ? d.channels.filter((x) => x !== c) : [...d.channels, c],
    });

  function submit() {
    save.mutate(
      { action: "form.save", form: d },
      {
        onSuccess: () => {
          toast.success("Formulário salvo");
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  const totalWeight = d.criteria.filter((c) => !c.eliminatory).reduce((s, c) => s + c.weight, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d.id ? "Editar formulário" : "Novo formulário de qualidade"}</DialogTitle>
          <DialogDescription>
            A IA dá nota em cada critério e mostra o trecho da conversa como prova.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="qf-name">Nome</Label>
            <Input
              id="qf-name"
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
              placeholder="Ex.: Atendimento ao cliente"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Vale para</Label>
            <div className="flex flex-wrap gap-2">
              {(["call", "chat", "email"] as QualityChannel[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChannel(c)}
                  aria-pressed={d.channels.includes(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] transition-colors duration-150 active:scale-[0.98]",
                    d.channels.includes(c)
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-[13px]">
            <span>
              Avaliar também as conversas atendidas pelos agentes de IA
              <span className="block text-[12px] text-muted-foreground">
                Recomendado: a IA é cobrada pela mesma régua do time.
              </span>
            </span>
            <Switch
              checked={d.include_ai}
              onCheckedChange={(v) => setD({ ...d, include_ai: v })}
              aria-label="Avaliar agentes de IA"
            />
          </label>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Critérios</Label>
              <span className="text-[11px] text-subtle">
                Peso total {totalWeight} · obrigatório reprovado zera a nota
              </span>
            </div>
            <ol className="grid gap-2">
              {d.criteria.map((c, i) => (
                <li
                  key={i}
                  className={cn(
                    "grid gap-2 rounded-xl border p-3",
                    c.eliminatory ? "border-danger/30 bg-danger/5" : "border-border bg-surface",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-4 shrink-0 text-subtle" aria-hidden />
                    <Input
                      value={c.label}
                      onChange={(e) => setCrit(i, { label: e.target.value })}
                      placeholder="O que o atendente precisa fazer"
                      aria-label={`Critério ${i + 1}`}
                      className="h-9"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover critério"
                      onClick={() => setD({ ...d, criteria: d.criteria.filter((_, j) => j !== i) })}
                      disabled={d.criteria.length <= 1}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <Input
                    value={c.description}
                    onChange={(e) => setCrit(i, { description: e.target.value })}
                    placeholder="Como reconhecer (opcional): ajuda a IA a ser justa"
                    aria-label={`Como reconhecer o critério ${i + 1}`}
                    className="h-9 text-[13px]"
                  />
                  <div className="flex flex-wrap items-center gap-4 text-[12px]">
                    <label className="flex items-center gap-2">
                      <ShieldAlert className="size-3.5 text-muted-foreground" aria-hidden />
                      Obrigatório (eliminatório)
                      <Switch
                        checked={c.eliminatory}
                        onCheckedChange={(v) => setCrit(i, { eliminatory: v })}
                        aria-label="Item eliminatório"
                      />
                    </label>
                    {!c.eliminatory && (
                      <label className="flex items-center gap-2">
                        Peso
                        <select
                          value={c.weight}
                          onChange={(e) => setCrit(i, { weight: Number(e.target.value) })}
                          className="h-8 rounded-lg border border-border bg-surface px-2"
                          aria-label="Peso do critério"
                        >
                          {[1, 2, 3, 4, 5].map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setD({
                  ...d,
                  criteria: [
                    ...d.criteria,
                    { id: "", label: "", description: "", weight: 2, eliminatory: false },
                  ],
                })
              }
              disabled={d.criteria.length >= 20}
            >
              <Plus /> Adicionar critério
            </Button>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch
              checked={d.is_active}
              onCheckedChange={(v) => setD({ ...d, is_active: v })}
              aria-label="Formulário ativo"
            />
            Ativo: avaliar as próximas interações com este formulário
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={save.isPending || !d.name.trim()}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
