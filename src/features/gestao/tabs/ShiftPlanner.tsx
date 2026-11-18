import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Loader2, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/functions";
import { Panel } from "@/features/reports/ui";
import { useTeamMembers } from "@/features/settings/api";

import { useCreateShifts, useDeleteShift, usePresence, useShifts, type ShiftRow } from "../api";
import { addDays } from "../forecast";
import { at, coverageFromShifts } from "./coverage";
import {
  SHIFT_TEMPLATES,
  computeAdherence,
  coverageOf,
  suggestShifts,
  toShiftWindow,
} from "../schedule";

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Escala do dia: sugere turnos para cobrir a necessidade, distribui entre as pessoas escolhidas e
// mostra a aderência quando a presença dos atendentes estiver disponível.
export function ShiftPlanner({
  accountId,
  day,
  need,
  canEdit,
}: {
  accountId: string;
  day: string;
  need: number[];
  canEdit: boolean;
}) {
  const fromIso = at(day, 0).toISOString();
  const toIso = at(addDays(day, 1), 0).toISOString();
  const shifts = useShifts(accountId, fromIso, toIso);
  const presence = usePresence(accountId, fromIso, toIso);
  const team = useTeamMembers(accountId);
  const create = useCreateShifts(accountId);
  const remove = useDeleteShift(accountId);
  const [templateIdx, setTemplateIdx] = useState("0");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const template = SHIFT_TEMPLATES[Number(templateIdx)] ?? SHIFT_TEMPLATES[0]!;
  const suggestion = useMemo(() => suggestShifts(need, template), [need, template]);
  const members = (team.data ?? []).filter((m) => m.isActive);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? "Pessoa removida";

  // Cobertura atual da escala gravada, para mostrar o que ainda falta.
  const current = useMemo(() => coverageFromShifts(shifts.data ?? [], day), [shifts.data, day]);
  const missingHours = need
    .map((n, h) => ({ h, gap: n - (current[h] ?? 0) }))
    .filter((x) => x.gap > 0);

  const hint = missingHours.length
    ? `Falta gente em ${missingHours.length} hora(s): ${missingHours
        .slice(0, 6)
        .map((x) => `${x.h}h (${x.gap})`)
        .join(", ")}`
    : (shifts.data?.length ?? 0) > 0
      ? "A escala cobre a necessidade prevista."
      : null;

  const adherence = useMemo(() => {
    if (!presence.data?.available || !shifts.data?.length) return null;
    return computeAdherence(shifts.data.map(toShiftWindow), presence.data.rows);
  }, [presence.data, shifts.data]);

  function createSchedule() {
    const people = members.filter((m) => picked.has(m.userId));
    if (people.length === 0) {
      toast.error("Escolha quem trabalha neste dia");
      return;
    }
    const rows = suggestion.map((s, i) => {
      const person = people[i % people.length]!;
      const breaks: ShiftRow["breaks"] =
        s.breakStartHour !== null
          ? [
              {
                start: at(day, s.breakStartHour).toISOString(),
                end: new Date(
                  at(day, s.breakStartHour).getTime() + s.breakMinutes * 60_000,
                ).toISOString(),
                label: s.breakMinutes >= 60 ? "Almoço" : "Pausa",
              },
            ]
          : [];
      return {
        user_id: person.userId,
        starts_at: at(day, s.startHour).toISOString(),
        ends_at: at(day, s.endHour).toISOString(),
        channel: "any",
        breaks,
      };
    });
    const overload = suggestion.length > people.length;
    create.mutate(rows, {
      onSuccess: () =>
        overload
          ? toast.warning(
              `Escala criada com ${rows.length} turnos para ${people.length} pessoas: alguém ficou com mais de um turno. Chame mais gente ou ajuste.`,
            )
          : toast.success(`Escala criada: ${rows.length} turnos`),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <Panel title="Escala do dia" {...(hint ? { hint } : {})}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {shifts.isPending ? (
            <p className="text-[13px] text-muted-foreground">Carregando a escala…</p>
          ) : (shifts.data ?? []).length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-4 text-[13px] text-muted-foreground">
              Nenhum turno neste dia.{" "}
              {canEdit
                ? "Escolha as pessoas ao lado e crie a escala sugerida."
                : "Peça a um gestor para montar a escala."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {(shifts.data ?? []).map((s) => {
                const adh = adherence?.find((a) => a.userId === s.user_id);
                return (
                  <li
                    key={s.id}
                    className="row-wash flex items-center gap-3 px-3 py-2.5 text-[13px]"
                  >
                    <Clock className="size-3.5 text-subtle" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{nameOf(s.user_id)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {hhmm(s.starts_at)}–{hhmm(s.ends_at)}
                      {s.breaks[0] && (
                        <span className="ml-1 text-[11px] text-subtle">
                          · pausa {hhmm(s.breaks[0].start)}
                        </span>
                      )}
                    </span>
                    {adh && (
                      <span
                        className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium tabular-nums"
                        title="Aderência à escala"
                      >
                        {Math.round(adh.adherence * 100)}%
                      </span>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Apagar turno de ${nameOf(s.user_id)}`}
                        onClick={() =>
                          remove.mutate(s.id, { onError: (e) => toast.error(errorMessage(e)) })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[12px] text-muted-foreground">
            {presence.data?.available
              ? "Aderência = tempo disponível ou atendendo dentro do horário de trabalho ÷ tempo escalado (pausa não conta contra)."
              : "A aderência aparece aqui quando o painel do call center começar a registrar a presença dos atendentes."}
          </p>
        </div>

        {canEdit && (
          <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <Wand2 className="size-4" aria-hidden /> Montar a escala sugerida
            </p>
            <Select value={templateIdx} onValueChange={setTemplateIdx}>
              <SelectTrigger aria-label="Tipo de turno">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHIFT_TEMPLATES.map((t, i) => (
                  <SelectItem key={t.label} value={String(i)}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground">
              {suggestion.length === 0
                ? "Pela previsão, este dia não precisa de turno."
                : `${suggestion.length} turnos cobrem o dia: ${suggestion
                    .slice(0, 5)
                    .map((s) => `${s.startHour}h–${s.endHour}h`)
                    .join(
                      ", ",
                    )}${suggestion.length > 5 ? "…" : ""}. Cobertura no pico: ${Math.max(...coverageOf(suggestion))} pessoas.`}
            </p>
            <fieldset className="max-h-48 space-y-1.5 overflow-y-auto">
              <legend className="mb-1 text-[12px] text-muted-foreground">
                Quem trabalha neste dia
              </legend>
              {members.length === 0 && (
                <p className="text-[12px] text-subtle">
                  Convide a equipe em Ajustes para montar a escala.
                </p>
              )}
              {members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-[13px]">
                  <Checkbox
                    checked={picked.has(m.userId)}
                    onCheckedChange={(v) => {
                      const next = new Set(picked);
                      if (v) next.add(m.userId);
                      else next.delete(m.userId);
                      setPicked(next);
                    }}
                  />
                  {m.name}
                </label>
              ))}
            </fieldset>
            <Button
              onClick={createSchedule}
              disabled={create.isPending || suggestion.length === 0}
              className="w-full"
            >
              {create.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden />
              )}
              Criar escala do dia
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
