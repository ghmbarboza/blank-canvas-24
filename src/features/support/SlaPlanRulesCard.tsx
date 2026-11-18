import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { SettingsCard } from "@/features/settings/SettingsCard";
import { useAccount } from "@/lib/account";
import { errorMessage } from "@/lib/functions";

import { useDeleteSlaPlanRule, useSaveSlaPlanRule, useSlaPlanRules, type SlaPlanRule } from "./api";
import { PRIORITY_LABEL, PRIORITY_ORDER, type TicketPriority } from "./constants";
import { buildTargets, describeRule, minutesToHours, type SlaTargets } from "./sla-plans";

// Prazos por plano/segmento do cliente: valem na abertura do chamado no lugar dos da prioridade.
export function SlaPlanRulesCard() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const rules = useSlaPlanRules(accountId);
  const remove = useDeleteSlaPlanRule(accountId);
  const save = useSaveSlaPlanRule(accountId);
  const [editing, setEditing] = useState<SlaPlanRule | "new" | null>(null);
  const list = rules.data ?? [];

  return (
    <SettingsCard
      title="Prazos por plano do cliente"
      description="Clientes de um plano ou segmento podem ter prazos próprios. Quando o chamado abre, olhamos a etiqueta ou o campo do contato e da empresa. A primeira regra da lista que bater vale; o resto segue os prazos por prioridade."
      readOnlyNote={isManager ? undefined : "Só gestores alteram as regras."}
      actions={
        isManager ? (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus /> Nova regra
          </Button>
        ) : undefined
      }
    >
      {list.length === 0 ? (
        <p className="text-[13px] text-subtle">
          Nenhuma regra ainda. Exemplo: etiqueta "Ouro" responde urgente em 15 minutos.
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-xl border border-border">
          {list.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-5 text-[12px] text-subtle tabular-nums">{i + 1}º</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">
                  {r.name}
                  {!r.is_active && <span className="ml-2 text-[11px] text-subtle">(pausada)</span>}
                </p>
                <p className="truncate text-[12px] text-subtle">
                  {describeRule(r)} · {summarize(r.targets as SlaTargets)}
                </p>
              </div>
              {isManager && (
                <>
                  <Switch
                    checked={r.is_active}
                    aria-label={`Regra ${r.name} ativa`}
                    onCheckedChange={(c) =>
                      save.mutate(
                        { id: r.id, values: { ...pick(r), is_active: c } },
                        { onError: (e) => toast.error(errorMessage(e)) },
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Editar ${r.name}`}
                    onClick={() => setEditing(r)}
                    className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${r.name}`}
                    onClick={() =>
                      remove.mutate(r.id, {
                        onSuccess: () => toast.success("Regra removida"),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                    className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          nextPosition={list.length}
          onClose={() => setEditing(null)}
        />
      )}
    </SettingsCard>
  );
}

function pick(r: SlaPlanRule) {
  return {
    name: r.name,
    match_kind: r.match_kind,
    match_field: r.match_field,
    match_value: r.match_value,
    applies_to: r.applies_to,
    targets: r.targets,
    business_hours: r.business_hours,
    position: r.position,
    is_active: r.is_active,
  };
}

function summarize(t: SlaTargets): string {
  const parts = PRIORITY_ORDER.filter((p) => t?.[p]).map((p) => {
    const x = t[p]!;
    const f = x.first ? `${minutesToHours(x.first)}h` : "padrão";
    const r = x.resolution ? `${minutesToHours(x.resolution)}h` : "padrão";
    return `${PRIORITY_LABEL[p]} ${f}/${r}`;
  });
  return parts.length ? parts.join(", ") : "sem prazos";
}

function RuleDialog({
  rule,
  nextPosition,
  onClose,
}: {
  rule: SlaPlanRule | null;
  nextPosition: number;
  onClose: () => void;
}) {
  const { current } = useAccount();
  const save = useSaveSlaPlanRule(current!.accountId);
  const targets = (rule?.targets ?? {}) as SlaTargets;
  const [name, setName] = useState(rule?.name ?? "");
  const [kind, setKind] = useState<"tag" | "field">(rule?.match_kind === "field" ? "field" : "tag");
  const [field, setField] = useState(rule?.match_field ?? "");
  const [value, setValue] = useState(rule?.match_value ?? "");
  const [where, setWhere] = useState(rule?.applies_to ?? "any");
  const [bh, setBh] = useState(rule?.business_hours ?? true);
  const [rows, setRows] = useState<Record<TicketPriority, { first: string; resolution: string }>>(
    () =>
      Object.fromEntries(
        PRIORITY_ORDER.map((p) => [
          p,
          {
            first: minutesToHours(targets[p]?.first),
            resolution: minutesToHours(targets[p]?.resolution),
          },
        ]),
      ) as Record<TicketPriority, { first: string; resolution: string }>,
  );

  function submit() {
    if (!name.trim() || !value.trim() || (kind === "field" && !field.trim())) {
      toast.error("Preencha o nome e a condição");
      return;
    }
    const built = buildTargets(rows);
    if (!built.ok) {
      toast.error(built.error);
      return;
    }
    save.mutate(
      {
        ...(rule ? { id: rule.id } : {}),
        values: {
          name: name.trim(),
          match_kind: kind,
          match_field: kind === "field" ? field.trim() : null,
          match_value: value.trim(),
          applies_to: where,
          targets: built.targets as never,
          business_hours: bh,
          position: rule?.position ?? nextPosition,
          is_active: rule?.is_active ?? true,
        },
      },
      {
        onSuccess: () => {
          toast.success("Regra salva. Vale para os próximos chamados.");
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar regra" : "Nova regra de prazo"}</DialogTitle>
          <DialogDescription>
            Deixe em branco a prioridade que deve seguir o prazo padrão.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="slp-name">Nome do plano</Label>
            <Input
              id="slp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Ouro"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Como reconhecer</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "tag" | "field")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tag">Pela etiqueta</SelectItem>
                  <SelectItem value="field">Por um campo personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Onde procurar</Label>
              <Select value={where} onValueChange={setWhere}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Contato ou empresa</SelectItem>
                  <SelectItem value="contact">Só no contato</SelectItem>
                  <SelectItem value="company">Só na empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {kind === "field" && (
              <div className="grid gap-1.5">
                <Label htmlFor="slp-field">Nome do campo</Label>
                <Input
                  id="slp-field"
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  placeholder="Ex.: plano"
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="slp-value">{kind === "tag" ? "Etiqueta" : "Valor do campo"}</Label>
              <Input
                id="slp-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={kind === "tag" ? "Ex.: Ouro" : "Ex.: Enterprise"}
              />
            </div>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-subtle">
                <th className="pb-2 font-medium">Prioridade</th>
                <th className="pb-2 font-medium">1ª resposta (horas)</th>
                <th className="pb-2 font-medium">Solução (horas)</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITY_ORDER.map((p) => (
                <tr key={p} className="border-t border-border">
                  <td className="py-2 font-medium">{PRIORITY_LABEL[p]}</td>
                  <td className="py-2 pr-3">
                    <Input
                      className="h-8 w-24"
                      inputMode="decimal"
                      placeholder="padrão"
                      value={rows[p].first}
                      aria-label={`1ª resposta ${PRIORITY_LABEL[p]}`}
                      onChange={(e) =>
                        setRows({ ...rows, [p]: { ...rows[p], first: e.target.value } })
                      }
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      className="h-8 w-24"
                      inputMode="decimal"
                      placeholder="padrão"
                      value={rows[p].resolution}
                      aria-label={`Solução ${PRIORITY_LABEL[p]}`}
                      onChange={(e) =>
                        setRows({ ...rows, [p]: { ...rows[p], resolution: e.target.value } })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-[13px]">
            Contar só no horário de atendimento
            <Switch checked={bh} onCheckedChange={setBh} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar regra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
