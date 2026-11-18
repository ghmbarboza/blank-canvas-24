import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useContactSources, useTeamMembers } from "@/features/contacts/api";
import { sourceLabel } from "@/features/contacts/types";
import { fieldsFor, useCustomFields } from "@/features/custom-fields/api";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";

import { useSaveSegment, useSegmentCount, type Segment } from "./api";
import {
  FIELD_LABEL,
  FIELD_OPS,
  OP_LABEL,
  type SegmentFilter,
  type SegmentOp,
  type SegmentRule,
} from "./rules";

const VALUE_LESS: SegmentOp[] = ["is_empty", "not_empty"];

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  segment?: Segment | null;
  initial?: SegmentFilter | null;
  onSaved?: (s: Segment) => void;
}

// Construtor de segmento com contagem ao vivo: quantas pessoas entrariam agora.
export function SegmentBuilder({
  accountId,
  open,
  onOpenChange,
  segment,
  initial,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [filter, setFilter] = useState<SegmentFilter>({ match: "all", rules: [] });
  const save = useSaveSegment(accountId);
  const count = useSegmentCount(accountId, filter.rules.length ? filter : null, open);
  const team = useTeamMembers(accountId);
  const sources = useContactSources(accountId);
  const custom = useCustomFields(accountId);

  useEffect(() => {
    if (!open) return;
    setName(segment?.name ?? "");
    setShared(segment?.is_shared ?? true);
    setFilter(
      segment?.filter ??
        initial ?? { match: "all", rules: [{ field: "temperature", op: "eq", value: "hot" }] },
    );
  }, [open, segment, initial]);

  const fields = [
    ...Object.keys(FIELD_LABEL),
    ...fieldsFor(custom.data, "contact").map((f) => `custom.${f.key}`),
  ];
  const labelOf = (f: string) =>
    f.startsWith("custom.")
      ? (fieldsFor(custom.data, "contact").find((c) => `custom.${c.key}` === f)?.label ?? f)
      : (FIELD_LABEL[f] ?? f);
  const opsOf = (f: string): SegmentOp[] => FIELD_OPS[f] ?? ["eq", "neq", "is_empty", "not_empty"];

  function update(i: number, patch: Partial<SegmentRule>) {
    setFilter((f) => ({ ...f, rules: f.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  }

  function valueInput(r: SegmentRule, i: number) {
    if (VALUE_LESS.includes(r.op)) return null;
    const v = r.value === undefined || r.value === null ? "" : String(r.value);
    const select = (opts: { value: string; label: string }[]) => (
      <Select {...(v ? { value: v } : {})} onValueChange={(x) => update(i, { value: x })}>
        <SelectTrigger className="h-9 min-w-0 flex-1" aria-label="Valor">
          <SelectValue placeholder="Escolha" />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
    switch (r.field) {
      case "temperature":
        return select([
          { value: "hot", label: "Quente" },
          { value: "warm", label: "Morno" },
          { value: "cold", label: "Frio" },
        ]);
      case "lifecycle":
        return select([
          { value: "lead", label: "Lead" },
          { value: "opportunity", label: "Oportunidade" },
          { value: "customer", label: "Cliente" },
          { value: "inactive", label: "Inativo" },
        ]);
      case "source":
        return select((sources.data ?? []).map((s) => ({ value: s, label: sourceLabel(s) })));
      case "owner":
        return select((team.data ?? []).map((m) => ({ value: m.userId, label: m.name })));
      case "score":
      case "created_days":
      case "inactive_days":
        return (
          <Input
            className="h-9 w-24"
            inputMode="numeric"
            value={v}
            onChange={(e) =>
              update(i, {
                value: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")),
              })
            }
            aria-label="Número"
          />
        );
      default:
        return (
          <Input
            className="h-9 min-w-0 flex-1"
            value={v}
            onChange={(e) => update(i, { value: e.target.value })}
            aria-label="Valor"
          />
        );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Dê um nome ao segmento");
      return;
    }
    try {
      const row = await save.mutateAsync({
        ...(segment ? { id: segment.id } : {}),
        name: name.trim(),
        filter,
        is_shared: shared,
      });
      toast.success("Segmento salvo");
      onSaved?.({ ...row, filter });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>{segment ? "Editar segmento" : "Novo segmento"}</DialogTitle>
            <DialogDescription>
              Segmentos alimentam a lista de contatos, campanhas de e-mail e automações.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="seg-name">Nome</Label>
              <Input
                id="seg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Leads quentes sem dono"
              />
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              Pessoas que atendem
              <Select
                value={filter.match}
                onValueChange={(v) => setFilter((f) => ({ ...f, match: v as "all" | "any" }))}
              >
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">todas</SelectItem>
                  <SelectItem value="any">qualquer</SelectItem>
                </SelectContent>
              </Select>
              das regras:
            </div>
            <ul className="space-y-2">
              {filter.rules.map((r, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2/40 p-2"
                >
                  <Select
                    value={r.field}
                    onValueChange={(f) =>
                      update(i, { field: f as SegmentRule["field"], op: opsOf(f)[0]!, value: null })
                    }
                  >
                    <SelectTrigger className="h-9 w-48" aria-label="Campo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem key={f} value={f}>
                          {labelOf(f)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={r.op} onValueChange={(o) => update(i, { op: o as SegmentOp })}>
                    <SelectTrigger className="h-9 w-40" aria-label="Condição">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {opsOf(r.field).map((o) => (
                        <SelectItem key={o} value={o}>
                          {OP_LABEL[o]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {valueInput(r, i)}
                  <button
                    type="button"
                    aria-label="Remover regra"
                    onClick={() =>
                      setFilter((f) => ({ ...f, rules: f.rules.filter((_, j) => j !== i) }))
                    }
                    className="ml-auto rounded-full p-1.5 text-subtle hover:bg-surface hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  rules: [...f.rules, { field: "lifecycle", op: "eq", value: "lead" }],
                }))
              }
            >
              <Plus /> Adicionar regra
            </Button>
            <div className="flex items-center justify-between rounded-2xl bg-[#001F35] px-4 py-3 text-white">
              <span className="inline-flex items-center gap-2 text-[13px] text-white/70">
                <Users className="size-4" /> Entram neste segmento agora
              </span>
              <span className="font-display text-[22px] font-semibold tabular-nums">
                {count.isFetching ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : count.isError ? (
                  "—"
                ) : (
                  formatNumber(count.data ?? 0)
                )}
              </span>
            </div>
            <label className="flex items-center justify-between gap-3 text-[13px]">
              Compartilhar com a equipe
              <Switch checked={shared} onCheckedChange={setShared} />
            </label>
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Salvar segmento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
