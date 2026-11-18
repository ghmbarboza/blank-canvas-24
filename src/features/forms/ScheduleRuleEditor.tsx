import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { useBookingPages } from "@/features/booking/api";

import { OP_LABEL, scheduleRule, type FormScheduleRule, type ScheduleOp } from "./schedule";
import type { FormField } from "./types";

const OWNER_PAGE = "__owner";

// "Escolha um horário" depois do envio: o lead qualificado recebe o link da agenda do dono.
export function ScheduleRuleEditor({
  accountId,
  fields,
  value,
  disabled,
  onChange,
}: {
  accountId: string;
  fields: FormField[];
  value: unknown;
  disabled: boolean;
  onChange: (rule: FormScheduleRule) => void;
}) {
  const rule = scheduleRule(value);
  const pages = useBookingPages(accountId);
  const active = (pages.data ?? []).filter((p) => p.is_active);
  const set = (patch: Partial<FormScheduleRule>) => onChange({ ...rule, ...patch });
  const usable = fields.filter((f) => f.type !== "hidden" || f.key.startsWith("utm"));
  const setCond = (i: number, patch: Partial<FormScheduleRule["conditions"][number]>) =>
    set({ conditions: rule.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <section className="rounded-[24px] border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Agenda depois do envio</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Quem qualifica vê o botão “Escolha um horário” e marca a reunião na hora, com o dono do
            lead.
          </p>
        </div>
        <Switch
          checked={rule.enabled}
          onCheckedChange={(c) => set({ enabled: c })}
          disabled={disabled}
          aria-label="Oferecer agenda depois do envio"
        />
      </div>
      {rule.enabled && (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Para quem</Label>
              <Select
                value={rule.match}
                onValueChange={(v) => set({ match: v as FormScheduleRule["match"] })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Todo mundo que enviar</SelectItem>
                  <SelectItem value="all">Só quem atender às regras</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Agenda de quem</Label>
              <Select
                value={rule.booking_slug ?? OWNER_PAGE}
                onValueChange={(v) => set({ booking_slug: v === OWNER_PAGE ? null : v })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OWNER_PAGE}>Do responsável escolhido para o lead</SelectItem>
                  {active.map((p) => (
                    <SelectItem key={p.id} value={p.slug}>
                      Página: {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {rule.match === "all" && (
            <div className="grid gap-2">
              {rule.conditions.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                  <Select
                    value={c.field}
                    onValueChange={(v) => setCond(i, { field: v })}
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label="Campo">
                      <SelectValue placeholder="Campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {usable.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={c.op}
                    onValueChange={(v) => setCond(i, { op: v as ScheduleOp })}
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label="Comparação">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(OP_LABEL) as ScheduleOp[]).map((op) => (
                        <SelectItem key={op} value={op}>
                          {OP_LABEL[op]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label="Valor"
                    value={c.value}
                    onChange={(e) => setCond(i, { value: e.target.value })}
                    disabled={disabled}
                    placeholder={c.op === "gte" || c.op === "lte" ? "ex.: 5000" : "valor"}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover regra"
                    onClick={() => set({ conditions: rule.conditions.filter((_, j) => j !== i) })}
                    disabled={disabled}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={disabled || usable.length === 0 || rule.conditions.length >= 10}
                  onClick={() =>
                    set({
                      conditions: [
                        ...rule.conditions,
                        { field: usable[0]?.key ?? "", op: "equals", value: "" },
                      ],
                    })
                  }
                >
                  <Plus /> Adicionar regra
                </Button>
              </div>
              <p className="text-[12px] text-subtle">
                Todas as regras precisam bater. Para nota mínima, use um campo de número com “é no
                mínimo”.
              </p>
            </div>
          )}
          <div className="grid gap-1.5 sm:max-w-sm">
            <Label htmlFor="fb-sched-label">Texto do botão</Label>
            <Input
              id="fb-sched-label"
              value={rule.label}
              maxLength={60}
              onChange={(e) => set({ label: e.target.value })}
              disabled={disabled}
            />
          </div>
          {active.length === 0 && (
            <p className="text-[12px] text-danger">
              Ninguém tem página de agendamento ativa. Crie uma em Agendamentos para o botão
              aparecer.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
