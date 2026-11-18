import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/functions";

import { useSavePlaybook, useScorecards, type PlaybookMeta, type PlaybookRow } from "./api";
import { FRAMEWORK_FIELDS, type Framework, type PlaybookContent } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
const split = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const join = (a: string[]) => a.join(", ");

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: PlaybookRow | null;
  initial: PlaybookContent;
}

// Editor do playbook por seções. Palavras-chave e gatilhos são o que o coach escuta na reunião.
export function PlaybookEditor({ accountId, open, onOpenChange, row, initial }: Props) {
  const save = useSavePlaybook(accountId);
  const scorecards = useScorecards(accountId);
  const [c, setC] = useState<PlaybookContent>(initial);
  const [meta, setMeta] = useState<PlaybookMeta>({
    pipeline_id: null,
    stage_id: null,
    scorecard_id: null,
    is_default: false,
    is_active: true,
  });
  const stages = useQuery({
    queryKey: ["all-stages-pb", accountId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("id, name, pipeline_id, pipelines(name)")
        .eq("account_id", accountId)
        .order("position");
      return data ?? [];
    },
  });
  useEffect(() => {
    if (!open) return;
    setC(initial);
    setMeta({
      pipeline_id: row?.pipeline_id ?? null,
      stage_id: row?.stage_id ?? null,
      scorecard_id: row?.scorecard_id ?? null,
      is_default: row?.is_default ?? false,
      is_active: row?.is_active ?? true,
    });
  }, [open, row, initial]);

  const set = <K extends keyof PlaybookContent>(k: K, v: PlaybookContent[K]) =>
    setC((s) => ({ ...s, [k]: v }));

  async function submit() {
    if (!c.name.trim()) {
      toast.error("Dê um nome ao playbook");
      return;
    }
    try {
      await save.mutateAsync({ ...(row ? { id: row.id } : {}), content: c, meta });
      toast.success("Playbook salvo. O coach usa a versão nova na próxima reunião.");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{row ? "Editar playbook" : "Novo playbook"}</SheetTitle>
          <SheetDescription>
            O coach ao vivo segue este roteiro: lembra o que falta, responde objeções e avisa os
            sinais de compra.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-24">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="pb-name">Nome</Label>
              <Input id="pb-name" value={c.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Qualificação</Label>
              <Select value={c.framework} onValueChange={(v) => set("framework", v as Framework)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANT">
                    BANT (orçamento, decisor, necessidade, prazo)
                  </SelectItem>
                  <SelectItem value="MEDDIC">MEDDIC</SelectItem>
                  <SelectItem value="SPIN">SPIN</SelectItem>
                  <SelectItem value="GPCT">GPCT</SelectItem>
                  <SelectItem value="custom">Próprio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Vale para a etapa</Label>
              <Select
                value={meta.stage_id ?? "any"}
                onValueChange={(v) => {
                  const st = (stages.data ?? []).find((s) => s.id === v);
                  setMeta((m) => ({
                    ...m,
                    stage_id: v === "any" ? null : v,
                    pipeline_id: st?.pipeline_id ?? null,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer etapa</SelectItem>
                  {(stages.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s.pipelines as unknown as { name: string } | null)?.name} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Rubrica da nota</Label>
              <Select
                value={meta.scorecard_id ?? "default"}
                onValueChange={(v) =>
                  setMeta((m) => ({ ...m, scorecard_id: v === "default" ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">A padrão da empresa</SelectItem>
                  {(scorecards.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2 text-[13px]">
              <label className="flex items-center justify-between gap-2">
                Playbook padrão{" "}
                <Switch
                  checked={meta.is_default}
                  onCheckedChange={(v) => setMeta((m) => ({ ...m, is_default: v }))}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                Ativo{" "}
                <Switch
                  checked={meta.is_active}
                  onCheckedChange={(v) => setMeta((m) => ({ ...m, is_active: v }))}
                />
              </label>
            </div>
          </div>

          <Section
            title="Roteiro (fases e itens)"
            hint="Itens obrigatórios entram no checklist do coach. Palavras-chave: o que o vendedor diz quando cumpre o item."
          >
            {c.phases.map((ph, pi) => (
              <div key={ph.id} className="rounded-xl border border-border p-3">
                <div className="flex gap-2">
                  <Input
                    value={ph.name}
                    onChange={(e) =>
                      set(
                        "phases",
                        c.phases.map((x, j) => (j === pi ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    className="font-medium"
                    aria-label="Nome da fase"
                  />
                  <Del
                    onClick={() =>
                      set(
                        "phases",
                        c.phases.filter((_, j) => j !== pi),
                      )
                    }
                  />
                </div>
                <ul className="mt-2 space-y-2">
                  {ph.items.map((it, ii) => {
                    const upd = (patch: Partial<typeof it>) =>
                      set(
                        "phases",
                        c.phases.map((x, j) =>
                          j === pi
                            ? {
                                ...x,
                                items: x.items.map((y, k) => (k === ii ? { ...y, ...patch } : y)),
                              }
                            : x,
                        ),
                      );
                    return (
                      <li
                        key={it.id}
                        className="grid gap-2 rounded-lg bg-surface-2/50 p-2 sm:grid-cols-[1fr_1fr_auto_auto]"
                      >
                        <Input
                          value={it.label}
                          onChange={(e) => upd({ label: e.target.value })}
                          placeholder="O que precisa acontecer"
                          aria-label="Item"
                        />
                        <Input
                          value={join(it.keywords)}
                          onChange={(e) => upd({ keywords: split(e.target.value) })}
                          placeholder="palavras-chave, separadas por vírgula"
                          aria-label="Palavras-chave"
                        />
                        <label className="flex items-center gap-1.5 text-[12px]">
                          <Switch
                            checked={it.required}
                            onCheckedChange={(v) => upd({ required: v })}
                          />{" "}
                          obrigatório
                        </label>
                        <Del
                          onClick={() =>
                            set(
                              "phases",
                              c.phases.map((x, j) =>
                                j === pi ? { ...x, items: x.items.filter((_, k) => k !== ii) } : x,
                              ),
                            )
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1"
                  onClick={() =>
                    set(
                      "phases",
                      c.phases.map((x, j) =>
                        j === pi
                          ? {
                              ...x,
                              items: [
                                ...x.items,
                                { id: uid(), label: "", required: true, keywords: [] },
                              ],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <Plus /> Item
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set("phases", [...c.phases, { id: uid(), name: "Nova fase", items: [] }])
              }
            >
              <Plus /> Fase
            </Button>
          </Section>

          <Section
            title="Perguntas de qualificação"
            hint={`Cada uma preenche um campo do ${c.framework} no negócio quando a ata é gerada.`}
          >
            {c.questions.map((q, i) => (
              <div key={q.id} className="flex gap-2">
                <Input
                  value={q.label}
                  onChange={(e) =>
                    set(
                      "questions",
                      c.questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  aria-label="Pergunta"
                />
                {FRAMEWORK_FIELDS[c.framework].length > 0 && (
                  <Select
                    value={q.field ?? "none"}
                    onValueChange={(v) =>
                      set(
                        "questions",
                        c.questions.map((x, j) =>
                          j === i
                            ? { id: x.id, label: x.label, ...(v === "none" ? {} : { field: v }) }
                            : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem campo</SelectItem>
                      {FRAMEWORK_FIELDS[c.framework].map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Del
                  onClick={() =>
                    set(
                      "questions",
                      c.questions.filter((_, j) => j !== i),
                    )
                  }
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => set("questions", [...c.questions, { id: uid(), label: "" }])}
            >
              <Plus /> Pergunta
            </Button>
          </Section>

          <Section
            title="Objeções"
            hint="Quando o cliente usa um dos gatilhos, o vendedor vê a resposta e a prova na hora."
          >
            {c.objections.map((o, i) => {
              const upd = (patch: Partial<typeof o>) =>
                set(
                  "objections",
                  c.objections.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={o.id} className="grid gap-2 rounded-xl border border-border p-3">
                  <div className="flex gap-2">
                    <Input
                      value={o.label}
                      onChange={(e) => upd({ label: e.target.value })}
                      placeholder="Ex.: Está caro"
                      aria-label="Objeção"
                    />
                    <Del
                      onClick={() =>
                        set(
                          "objections",
                          c.objections.filter((_, j) => j !== i),
                        )
                      }
                    />
                  </div>
                  <Input
                    value={join(o.triggers)}
                    onChange={(e) => upd({ triggers: split(e.target.value) })}
                    placeholder="gatilhos: caro, fora do orçamento"
                    aria-label="Gatilhos"
                  />
                  <Textarea
                    rows={2}
                    value={o.answer}
                    onChange={(e) => upd({ answer: e.target.value })}
                    placeholder="Resposta sugerida"
                    aria-label="Resposta"
                  />
                  <Input
                    value={o.proof ?? ""}
                    onChange={(e) => upd({ proof: e.target.value })}
                    placeholder="Prova (caso, número, depoimento)"
                    aria-label="Prova"
                  />
                </div>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set("objections", [
                  ...c.objections,
                  { id: uid(), label: "", triggers: [], answer: "" },
                ])
              }
            >
              <Plus /> Objeção
            </Button>
          </Section>

          <Section
            title="Concorrentes (battlecards)"
            hint="Quando o cliente cita um concorrente, aparecem os seus argumentos."
          >
            {c.competitors.map((o, i) => {
              const upd = (patch: Partial<typeof o>) =>
                set(
                  "competitors",
                  c.competitors.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={o.id} className="grid gap-2 rounded-xl border border-border p-3">
                  <div className="flex gap-2">
                    <Input
                      value={o.name}
                      onChange={(e) => upd({ name: e.target.value })}
                      placeholder="Nome do concorrente"
                      aria-label="Concorrente"
                    />
                    <Del
                      onClick={() =>
                        set(
                          "competitors",
                          c.competitors.filter((_, j) => j !== i),
                        )
                      }
                    />
                  </div>
                  <Input
                    value={join(o.triggers)}
                    onChange={(e) => upd({ triggers: split(e.target.value) })}
                    placeholder="como o cliente fala dele"
                    aria-label="Gatilhos"
                  />
                  <Textarea
                    rows={3}
                    value={o.arguments.join("\n")}
                    onChange={(e) =>
                      upd({
                        arguments: e.target.value
                          .split("\n")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Um argumento por linha"
                    aria-label="Argumentos"
                  />
                </div>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set("competitors", [
                  ...c.competitors,
                  { id: uid(), name: "", triggers: [], arguments: [] },
                ])
              }
            >
              <Plus /> Concorrente
            </Button>
          </Section>

          <Section
            title="Sinais de fechamento"
            hint="Frases do cliente que indicam compra e o que propor naquele momento (inclua upsell do catálogo)."
          >
            {c.closing_signals.map((o, i) => {
              const upd = (patch: Partial<typeof o>) =>
                set(
                  "closing_signals",
                  c.closing_signals.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                );
              return (
                <div key={o.id} className="grid gap-2 rounded-xl border border-border p-3">
                  <div className="flex gap-2">
                    <Input
                      value={o.label}
                      onChange={(e) => upd({ label: e.target.value })}
                      placeholder="Ex.: Perguntou como contratar"
                      aria-label="Sinal"
                    />
                    <Del
                      onClick={() =>
                        set(
                          "closing_signals",
                          c.closing_signals.filter((_, j) => j !== i),
                        )
                      }
                    />
                  </div>
                  <Input
                    value={join(o.triggers)}
                    onChange={(e) => upd({ triggers: split(e.target.value) })}
                    placeholder="gatilhos"
                    aria-label="Gatilhos"
                  />
                  <Textarea
                    rows={2}
                    value={o.proposal}
                    onChange={(e) => upd({ proposal: e.target.value })}
                    placeholder="O que propor"
                    aria-label="Proposta"
                  />
                </div>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                set("closing_signals", [
                  ...c.closing_signals,
                  { id: uid(), label: "", triggers: [], proposal: "" },
                ])
              }
            >
              <Plus /> Sinal
            </Button>
          </Section>

          <Section
            title="Frases proibidas"
            hint="Promessas que o vendedor não pode fazer. O coach alerta na hora."
          >
            <Textarea
              rows={3}
              value={c.forbidden_phrases.join("\n")}
              onChange={(e) =>
                set(
                  "forbidden_phrases",
                  e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
              placeholder="Uma por linha"
              aria-label="Frases proibidas"
            />
          </Section>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background px-4 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} Salvar playbook
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="flex-1">
          <span className="block text-[14px] font-semibold">{title}</span>
          <span className="block text-[12px] text-muted-foreground">{hint}</span>
        </span>
        <ChevronDown
          className={`size-4 text-subtle transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="space-y-2 border-t border-border p-4">{children}</div>}
    </section>
  );
}

function Del({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remover"
      onClick={onClick}
      className="shrink-0 rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-danger"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
