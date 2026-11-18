import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Clock, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { RuleRow } from "./api";
import { readRuleOptions, whenText, type RuleDef, type RuleOptions } from "./rules";

type Props = {
  def: RuleDef;
  /** Posição na jornada (1 a 9). */
  step: number;
  row: RuleRow | undefined;
  canEdit: boolean;
  /** Automações ligadas na conta: sem isso a regra não pode ser ligada. */
  engineOn: boolean;
  toggling: boolean;
  saving: boolean;
  /** Aviso curto abaixo do título (ex.: depende de outra regra). */
  hint?: string | undefined;
  onToggle: (on: boolean, opts: RuleOptions) => void;
  onSave: (opts: RuleOptions) => Promise<void>;
};

// Uma regra da jornada: o que faz, quando dispara, a mensagem (editável) e o liga/desliga.
export function RuleCard({
  def,
  step,
  row,
  canEdit,
  engineOn,
  toggling,
  saving,
  hint,
  onToggle,
  onSave,
}: Props) {
  const uid = useId();
  const saved = row
    ? readRuleOptions(def.key, row)
    : { message: def.message, days: def.days?.value ?? null };
  const [message, setMessage] = useState(saved.message ?? "");
  const [days, setDays] = useState(saved.days === null ? "" : String(saved.days));
  const [open, setOpen] = useState(false);

  // O que está salvo mudou (outra aba, outro gestor): a tela acompanha, sem apagar o que se digita.
  const savedKey = `${saved.message ?? ""}|${saved.days ?? ""}`;
  useEffect(() => {
    setMessage(saved.message ?? "");
    setDays(saved.days === null ? "" : String(saved.days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const isOn = row?.status === "active";
  const daysNumber = def.days ? Number(days) : null;
  const daysValid =
    !def.days ||
    (Number.isInteger(daysNumber) && daysNumber! >= def.days.min && daysNumber! <= def.days.max);
  const messageValid = def.message === null || message.trim().length > 0;
  const dirty =
    (def.message !== null && message !== (saved.message ?? "")) ||
    (def.days !== null && days !== String(saved.days ?? ""));
  const editable = def.message !== null || def.days !== null;
  const opts: RuleOptions = {
    ...(def.message !== null ? { message } : {}),
    ...(def.days && daysValid ? { days: daysNumber! } : {}),
  };
  const passed = row?.stats.total ?? 0;
  const inProgress = row?.stats.active ?? 0;

  return (
    <li className="relative pl-12 sm:pl-14">
      <span
        aria-hidden
        className={cn(
          "absolute top-4 left-0 grid size-8 place-items-center rounded-full border font-display text-[13px] font-semibold tabular-nums transition-colors sm:left-1",
          isOn
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-surface text-subtle",
        )}
      >
        {step}
      </span>
      <Collapsible open={open} onOpenChange={setOpen}>
        <article
          aria-labelledby={`${uid}-title`}
          className={cn(
            "rounded-[20px] border bg-surface transition-colors",
            isOn ? "border-primary/40" : "border-border",
          )}
        >
          <div className="flex items-start gap-4 p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h3 id={`${uid}-title`} className="text-[15px] font-semibold text-foreground">
                  {def.title}
                </h3>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    isOn
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border bg-surface-2 text-muted-foreground",
                  )}
                >
                  {isOn ? "Ligada" : "Desligada"}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{def.what}</p>
              <p className="mt-2 flex items-start gap-1.5 text-[12px] text-subtle">
                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{whenText(def, daysValid ? daysNumber : saved.days)}</span>
              </p>
              {hint && (
                <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-muted-foreground">
                  {hint}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                {toggling && (
                  <Loader2 className="size-4 animate-spin text-subtle" aria-label="Salvando" />
                )}
                <Switch
                  checked={isOn}
                  disabled={!canEdit || toggling || (!isOn && !engineOn)}
                  onCheckedChange={(v) => onToggle(v, opts)}
                  aria-label={isOn ? `Desligar a regra ${def.title}` : `Ligar a regra ${def.title}`}
                />
              </div>
              <p className="text-right text-[11px] leading-tight text-subtle">
                <span className="block font-display text-[16px] font-semibold text-foreground tabular-nums">
                  {formatNumber(passed)}
                </span>
                {passed === 1 ? "cliente passou" : "clientes passaram"}
                {inProgress > 0 && (
                  <span className="block">{formatNumber(inProgress)} no meio do caminho</span>
                )}
              </p>
            </div>
          </div>

          {editable && (
            <>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-b-[20px] border-t border-border px-4 py-2.5 text-left text-[12px] font-medium text-muted-foreground hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:rounded-b-none sm:px-5"
                >
                  <span className="min-w-0 truncate">
                    {open
                      ? "Fechar"
                      : def.message !== null
                        ? `Mensagem: “${message.trim() || "sem texto"}”`
                        : `${def.days?.label}: ${days || "?"}`}
                  </span>
                  <ChevronDown
                    className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
                    aria-hidden
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <form
                  className="grid gap-4 border-t border-border p-4 sm:p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (dirty && daysValid && messageValid) void onSave(opts);
                  }}
                >
                  {def.message !== null && (
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${uid}-msg`}>Mensagem que o cliente recebe</Label>
                      <Textarea
                        id={`${uid}-msg`}
                        rows={3}
                        maxLength={1000}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        disabled={!canEdit}
                        aria-invalid={!messageValid}
                        aria-describedby={`${uid}-msg-help`}
                      />
                      <p id={`${uid}-msg-help`} className="text-[12px] text-subtle">
                        {messageValid
                          ? def.key === "pesquisa"
                            ? "{{primeiro_nome}} vira o nome do cliente e {{link_pesquisa}} vira o link para dar a nota."
                            : def.key === "nota_alta_indicacao"
                              ? "{{primeiro_nome}} vira o nome do cliente e {{link_avaliacao}} vira o seu link de avaliação no Google (sem link cadastrado, a mensagem sai sem ele)."
                              : def.key === "fim_garantia"
                                ? "{{primeiro_nome}} vira o nome do cliente e {{fim_garantia}} vira o dia em que a garantia dele vence."
                                : "{{primeiro_nome}} vira o nome do cliente."
                          : "Escreva a mensagem antes de salvar."}
                      </p>
                    </div>
                  )}
                  {def.days && (
                    <div className="grid max-w-[220px] gap-1.5">
                      <Label htmlFor={`${uid}-days`}>{def.days.label}</Label>
                      <Input
                        id={`${uid}-days`}
                        inputMode="numeric"
                        value={days}
                        onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        disabled={!canEdit}
                        aria-invalid={!daysValid}
                        aria-describedby={`${uid}-days-help`}
                      />
                      <p
                        id={`${uid}-days-help`}
                        className={cn("text-[12px]", daysValid ? "text-subtle" : "text-danger")}
                      >
                        De {def.days.min} a {def.days.max} dias.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {canEdit && (
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!dirty || !daysValid || !messageValid || saving}
                      >
                        {saving && <Loader2 className="animate-spin" />}
                        Salvar
                      </Button>
                    )}
                    {dirty && canEdit && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setMessage(saved.message ?? "");
                          setDays(saved.days === null ? "" : String(saved.days));
                        }}
                      >
                        Desfazer
                      </Button>
                    )}
                    {row && engineOn && (
                      <Link
                        to="/automacoes/$automationId"
                        params={{ automationId: row.id }}
                        className="ml-auto rounded text-[12px] font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        Ver quem passou por esta regra
                      </Link>
                    )}
                  </div>
                </form>
              </CollapsibleContent>
            </>
          )}
        </article>
      </Collapsible>
    </li>
  );
}
