import { useQuery } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { fieldsFor, useCustomFields } from "@/features/custom-fields/api";
import { useSegments } from "@/features/segments/api";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/format";

import { useAutomationAction, type Automation } from "./api";
import { DEFAULT_GUARDS, type ExitRules, type Guards, type Trigger } from "./engine";
import { EVENT_LABEL } from "./triggerSummary";

interface Props {
  accountId: string;
  automation: Automation;
  readOnly: boolean;
  onChange: (patch: Partial<Automation>) => void;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const EXITS: { key: keyof ExitRules; label: string }[] = [
  { key: "on_reply", label: "Respondeu em qualquer canal (pausa a cadência)" },
  { key: "on_meeting", label: "Marcou uma reunião" },
  { key: "on_customer", label: "Virou cliente" },
  { key: "on_unsubscribe", label: "Descadastrou ou marcou como spam" },
  { key: "on_deal_lost", label: "Negócio perdido" },
];

// Gatilho, saída automática e guardas (teto semanal, horário comercial, consentimento).
export function SettingsPanel({ accountId, automation, readOnly, onChange }: Props) {
  const t = automation.trigger;
  const guards: Guards = { ...DEFAULT_GUARDS, ...automation.guards };
  const setTrigger = (patch: Partial<Trigger>) => onChange({ trigger: { ...t, ...patch } });
  const setGuards = (patch: Partial<Guards>) => onChange({ guards: { ...guards, ...patch } });
  const segments = useSegments(accountId);
  const fields = useCustomFields(accountId);
  const forms = useQuery({
    queryKey: ["auto-forms", accountId],
    enabled: t.type === "event" && t.event === "form.submitted",
    queryFn: async () =>
      (await supabase.from("forms").select("id, name").eq("account_id", accountId).order("name"))
        .data ?? [],
  });
  const stages = useQuery({
    queryKey: ["auto-stages", accountId],
    enabled: t.type === "event" && t.event === "deal.stage_changed",
    queryFn: async () =>
      (
        await supabase
          .from("pipeline_stages")
          .select("id, name, pipelines(name)")
          .eq("account_id", accountId)
          .order("position")
      ).data ?? [],
  });
  const action = useAutomationAction(accountId);
  const [preview, setPreview] = useState<{ count: number | null; label: string } | null>(null);
  useEffect(() => {
    setPreview(null);
    if (automation.status === "draft" && t.type === "manual") return;
    const id = setTimeout(() => {
      action.mutate(
        { action: "preview", automationId: automation.id },
        {
          onSuccess: (r) => setPreview(r as { count: number | null; label: string }),
          onError: () => setPreview(null),
        },
      );
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automation.id, JSON.stringify(t)]);

  const bh = guards.business_hours;
  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <section className="rounded-[24px] border border-border bg-surface p-5">
        <p className="eyebrow mb-3">Tipo e descrição</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select
              value={automation.kind}
              onValueChange={(v) => onChange({ kind: v as Automation["kind"] })}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="journey">Jornada (marketing e relacionamento)</SelectItem>
                <SelectItem value="sequence">Cadência de vendas (toques do vendedor)</SelectItem>
                <SelectItem value="rule">Regra (operação interna)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Pode entrar de novo?</Label>
            <Select
              value={automation.reentry}
              onValueChange={(v) => onChange({ reentry: v as Automation["reentry"] })}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Nunca (uma vez por contato)</SelectItem>
                <SelectItem value="after_exit">Depois de terminar ou sair</SelectItem>
                <SelectItem value="always">Sempre que o gatilho acontecer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="auto-desc">Para que serve</Label>
            <Textarea
              id="auto-desc"
              rows={2}
              value={automation.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value })}
              disabled={readOnly}
            />
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-5">
        <p className="eyebrow mb-3">Gatilho: quando o contato entra</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Entra quando</Label>
            <Select
              value={t.type}
              onValueChange={(v) => onChange({ trigger: { type: v as Trigger["type"] } })}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">
                  Alguém inscreve (lista de contatos ou negócio)
                </SelectItem>
                <SelectItem value="event">Algo acontece</SelectItem>
                <SelectItem value="segment">Entra num segmento</SelectItem>
                <SelectItem value="no_reply">Fica sem responder</SelectItem>
                <SelectItem value="inactive">Cliente fica sem conversa</SelectItem>
                <SelectItem value="date">Chega uma data do contato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {t.type === "event" && (
            <div className="grid gap-1.5">
              <Label>Evento</Label>
              <Select
                value={t.event ?? ""}
                onValueChange={(v) => setTrigger({ event: v, filters: {} })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {t.type === "event" && t.event === "form.submitted" && (
            <div className="grid gap-1.5">
              <Label>Só deste formulário</Label>
              <Select
                value={t.filters?.form_id ?? "__any"}
                onValueChange={(v) => setTrigger({ filters: v === "__any" ? {} : { form_id: v } })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Qualquer formulário</SelectItem>
                  {(forms.data ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {t.type === "event" && t.event === "deal.stage_changed" && (
            <div className="grid gap-1.5">
              <Label>Quando entra na etapa</Label>
              <Select
                value={t.filters?.to ?? "__any"}
                onValueChange={(v) => setTrigger({ filters: v === "__any" ? {} : { to: v } })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Qualquer etapa</SelectItem>
                  {(stages.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s.pipelines as unknown as { name: string } | null)?.name} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {t.type === "segment" && (
            <div className="grid gap-1.5">
              <Label>Segmento</Label>
              <Select
                value={t.segment_id ?? ""}
                onValueChange={(v) => setTrigger({ segment_id: v })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {(segments.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {t.type === "no_reply" && (
            <div className="grid gap-1.5">
              <Label htmlFor="trg-h">Horas sem resposta depois da nossa última mensagem</Label>
              <Input
                id="trg-h"
                inputMode="numeric"
                value={String(t.hours ?? 24)}
                onChange={(e) =>
                  setTrigger({ hours: Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)) })
                }
                disabled={readOnly}
              />
            </div>
          )}
          {t.type === "inactive" && (
            <div className="grid gap-1.5">
              <Label htmlFor="trg-d">Dias sem conversa com o cliente</Label>
              <Input
                id="trg-d"
                inputMode="numeric"
                value={String(t.days ?? 30)}
                onChange={(e) =>
                  setTrigger({ days: Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)) })
                }
                disabled={readOnly}
              />
            </div>
          )}
          {t.type === "date" && (
            <>
              <div className="grid gap-1.5">
                <Label>Campo de data</Label>
                <Select
                  value={t.field ?? ""}
                  onValueChange={(v) => setTrigger({ field: v })}
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um campo de data" />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldsFor(fields.data, "contact")
                      .filter((f) => f.type === "date")
                      .map((f) => (
                        <SelectItem key={f.id} value={`custom.${f.key}`}>
                          {f.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="trg-d">Quantos dias antes</Label>
                <Input
                  id="trg-d"
                  inputMode="numeric"
                  value={String(t.days_before ?? 0)}
                  onChange={(e) =>
                    setTrigger({ days_before: Number(e.target.value.replace(/\D/g, "") || 0) })
                  }
                  disabled={readOnly}
                />
              </div>
            </>
          )}
        </div>
        {preview && (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#0A1F3B] px-4 py-3 text-white">
            <span className="inline-flex items-center gap-2 text-[13px] text-white/70">
              <Users className="size-4" /> {preview.label}
            </span>
            <span className="font-display text-[22px] font-semibold tabular-nums">
              {action.isPending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : preview.count === null ? (
                "—"
              ) : (
                formatNumber(preview.count)
              )}
            </span>
          </div>
        )}
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-5">
        <p className="eyebrow mb-1">Saída automática</p>
        <p className="mb-3 text-[12px] text-muted-foreground">
          O contato para de receber os passos quando:
        </p>
        <div className="grid gap-2">
          {EXITS.map((x) => (
            <label key={x.key} className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={Boolean(automation.exit_rules[x.key])}
                onCheckedChange={(v) =>
                  onChange({ exit_rules: { ...automation.exit_rules, [x.key]: Boolean(v) } })
                }
                disabled={readOnly}
              />
              {x.label}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-5">
        <p className="eyebrow mb-3">Guardas (protegem o contato e a sua reputação)</p>
        <div className="grid gap-4">
          <div className="grid gap-1.5 sm:w-72">
            <Label htmlFor="g-cap">
              Máximo de mensagens por pessoa por semana (somando automações e canais)
            </Label>
            <Input
              id="g-cap"
              inputMode="numeric"
              value={String(guards.weekly_cap)}
              onChange={(e) =>
                setGuards({ weekly_cap: Number(e.target.value.replace(/\D/g, "") || 0) })
              }
              disabled={readOnly}
            />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
            Respeitar consentimento e lista de não contatar
            <Switch
              checked={guards.respect_consent}
              onCheckedChange={(v) => setGuards({ respect_consent: v })}
              disabled={readOnly}
            />
          </label>
          <div className="rounded-xl border border-border p-3">
            <label className="flex items-center justify-between gap-3 text-[13px]">
              Enviar só em horário comercial (fuso da empresa)
              <Switch
                checked={Boolean(bh)}
                onCheckedChange={(v) =>
                  setGuards({ business_hours: v ? (DEFAULT_GUARDS.business_hours ?? null) : null })
                }
                disabled={readOnly}
              />
            </label>
            {bh && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="bh-s" className="text-[11px]">
                    Das
                  </Label>
                  <Input
                    id="bh-s"
                    type="time"
                    className="w-28"
                    value={bh.start}
                    onChange={(e) =>
                      setGuards({ business_hours: { ...bh, start: e.target.value } })
                    }
                    disabled={readOnly}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="bh-e" className="text-[11px]">
                    Até
                  </Label>
                  <Input
                    id="bh-e"
                    type="time"
                    className="w-28"
                    value={bh.end}
                    onChange={(e) => setGuards({ business_hours: { ...bh, end: e.target.value } })}
                    disabled={readOnly}
                  />
                </div>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      disabled={readOnly}
                      onClick={() =>
                        setGuards({
                          business_hours: {
                            ...bh,
                            days: bh.days.includes(i)
                              ? bh.days.filter((x) => x !== i)
                              : [...bh.days, i].sort(),
                          },
                        })
                      }
                      className={
                        bh.days.includes(i)
                          ? "rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
                          : "rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
                      }
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
