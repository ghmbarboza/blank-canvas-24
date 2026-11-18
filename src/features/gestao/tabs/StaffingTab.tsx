import { hasChannel } from "@/lib/edition";
import { useMemo, useState } from "react";
import { AlertCircle, CalendarDays, Info, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";
import { LoadingGrid, Panel } from "@/features/reports/ui";

import {
  useSaveWorkforceSettings,
  useShifts,
  useVolumeHistory,
  useWorkforceSettings,
  type WorkforceSettings,
} from "../api";
import {
  addDays,
  ahtFor,
  channelLabel,
  explainHour,
  forecastDay,
  staffingPlan,
  summarize,
} from "../forecast";
import { at, coverageFromShifts } from "./coverage";
import { HourlyDemand } from "./HourlyDemand";
import { ShiftPlanner } from "./ShiftPlanner";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return `${WEEKDAY[dt.getDay()]}, ${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`;
}

function weekdayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAY[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? "";
}

// "amanhã", "hoje" ou "na quinta, 30/10": a pergunta muda com o dia escolhido.
function whenLabel(day: string): string {
  const today = todayIso();
  if (day === today) return "hoje";
  if (day === addDays(today, 1)) return "amanhã";
  const [, m, d] = day.split("-");
  const wd = weekdayOf(day);
  const article = wd === "sábado" || wd === "domingo" ? "no" : "na";
  return `${article} ${wd}, ${d}/${m}`;
}

function hoursList(hs: number[]): string {
  const labels = hs.map((h) => `${h}h`);
  return labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

// "Quantas pessoas preciso amanhã?": previsão sazonal + Erlang C, com a conta explicada.
export function StaffingTab({ accountId, canEdit }: { accountId: string; canEdit: boolean }) {
  const [day, setDay] = useState(() => addDays(todayIso(), 1));
  const [hour, setHour] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const settings = useWorkforceSettings(accountId);
  const weeks = settings.data?.weeks_history ?? 8;
  const history = useVolumeHistory(accountId, weeks);
  const shifts = useShifts(
    accountId,
    at(day, 0).toISOString(),
    at(addDays(day, 1), 0).toISOString(),
  );
  const covered = useMemo(
    () => (shifts.data && shifts.data.length > 0 ? coverageFromShifts(shifts.data, day) : null),
    [shifts.data, day],
  );

  const computed = useMemo(() => {
    if (!history.data || !settings.data) return null;
    const forecast = forecastDay(history.data, day, weeks);
    const plan = staffingPlan(forecast, history.data, {
      serviceLevel: settings.data.service_level_pct / 100,
      answerSeconds: settings.data.answer_seconds,
      shrinkage: settings.data.shrinkage_pct / 100,
      chatConcurrency: settings.data.chat_concurrency,
      aht: settings.data.aht_seconds,
    });
    return { forecast, plan, summary: summarize(plan) };
  }, [history.data, settings.data, day, weeks]);

  if (history.isPending || settings.isPending) return <LoadingGrid />;
  if (history.isError || settings.isError)
    return (
      <p className="text-[13px] text-danger">
        Não deu para ler o histórico: {errorMessage(history.error ?? settings.error)}
      </p>
    );
  if (!computed || computed.forecast.length === 0)
    return (
      <EmptyState
        icon={CalendarDays}
        title="Ainda não dá para dizer quantas pessoas você precisa"
        description="A previsão usa as últimas semanas de conversas e chamados. Assim que a operação rodar por uma semana, a resposta aparece aqui."
      />
    );

  const { forecast, plan, summary } = computed;
  const first = Math.max(0, (summary.firstHour ?? 8) - 1);
  const last = Math.min(23, (summary.lastHour ?? 18) + 1);
  const selected = hour !== null ? plan[hour] : null;
  const shortHours = covered
    ? plan.filter((p) => p.scheduled > (covered[p.hour] ?? 0)).map((p) => p.hour)
    : [];
  const maxGap = covered
    ? Math.max(0, ...plan.map((p) => p.scheduled - (covered[p.hour] ?? 0)))
    : 0;
  const weeksUsed = Math.max(0, ...forecast.map((f) => f.weeksUsed));
  const when = whenLabel(day);

  return (
    <div className="space-y-6">
      <section aria-labelledby="staffing-question" className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <p className="eyebrow">Previsão para {dayLabel(day)}</p>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="sr-only">Escolher outro dia</span>
            <input
              type="date"
              value={day}
              min={todayIso()}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </label>
        </div>
        <h2
          id="staffing-question"
          className="mt-3 font-display text-[28px] leading-tight font-medium sm:text-[40px]"
        >
          Quantas pessoas preciso {when}?
        </h2>
        {summary.peakHour !== null ? (
          <>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-6xl font-semibold tabular-nums sm:text-7xl">
                {summary.peakPeople}
              </span>
              <span className="text-[18px] text-muted-foreground">
                {summary.peakPeople === 1 ? "pessoa" : "pessoas"} no pico, às{" "}
                <strong className="font-semibold text-foreground">{summary.peakHour}h</strong>
              </span>
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Pela fórmula de Erlang C e pelo histórico das últimas {weeksUsed || weeks}{" "}
              {weekdayOf(day)}s, chegam cerca de{" "}
              <strong className="font-semibold text-foreground tabular-nums">
                {formatNumber(summary.totalArrivals)} contatos
              </strong>{" "}
              entre {summary.firstHour}h e {(summary.lastHour ?? 0) + 1}h. São{" "}
              {formatNumber(summary.personHours)} horas de gente escalada para atender{" "}
              {settings.data.service_level_pct}% em até {settings.data.answer_seconds} segundos, já
              contando {settings.data.shrinkage_pct}% de pausa e ausência.
            </p>
          </>
        ) : (
          <p className="mt-4 text-[15px] text-muted-foreground">
            Pelo histórico, este dia não deve ter movimento.
          </p>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel
          title="Necessidade e escala por hora"
          hint="Toque numa hora para ver de onde veio o número."
          aside={
            canEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
                <Settings2 className="size-3.5" aria-hidden /> Ajustar meta
              </Button>
            )
          }
        >
          <div className="mb-4 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-primary" aria-hidden /> Necessidade (Erlang C)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-surface-3 ring-1 ring-border" aria-hidden />
              {covered ? "Pessoas na escala" : "Escala ainda não montada"}
            </span>
            {shortHours.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-danger" aria-hidden /> Falta gente
              </span>
            )}
          </div>
          <HourlyDemand
            need={plan.map((p) => p.scheduled)}
            covered={covered}
            firstHour={first}
            lastHour={last}
            selectedHour={hour}
            onSelect={setHour}
          />
          {shortHours.length > 0 && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div className="text-[13px]">
                <p className="font-semibold">
                  Falta gente {shortHours.length === 1 ? "às" : "nas horas"}{" "}
                  {hoursList(shortHours.slice(0, 6))}
                  {shortHours.length > 6 ? ` e mais ${shortHours.length - 6}` : ""}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  A escala gravada fica até {maxGap} {maxGap === 1 ? "pessoa" : "pessoas"} abaixo do
                  necessário. Ajuste os turnos na escala do dia, logo abaixo.
                </p>
              </div>
            </div>
          )}
          {!covered && summary.peakHour !== null && (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Ainda não há escala gravada para {when}. Monte os turnos na escala do dia, logo
              abaixo, e a comparação aparece aqui.
            </p>
          )}
          {showSettings && canEdit && (
            <SettingsForm
              accountId={accountId}
              current={settings.data}
              channels={forecast.map((f) => f.channel)}
              onDone={() => setShowSettings(false)}
            />
          )}
        </Panel>

        <Panel
          title={selected ? `Às ${selected.hour}h` : "Por canal"}
          {...(selected ? {} : { hint: "Volume esperado no dia inteiro" })}
        >
          {selected ? (
            <div className="space-y-3 text-[13px]">
              <p className="font-display text-[24px] font-semibold tabular-nums">
                {selected.scheduled}{" "}
                <span className="text-[13px] font-normal text-muted-foreground">escaladas</span>
              </p>
              <ul className="space-y-2">
                {forecast
                  .filter((f) => (f.hours[selected.hour]?.expected ?? 0) > 0)
                  .map((f) => (
                    <li key={f.channel} className="rounded-xl bg-surface-2 p-3">
                      <p className="font-medium">
                        {channelLabel(f.channel)}: {selected.byChannel[f.channel] ?? 0} no posto
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                        {explainHour(f, selected.hour)}
                      </p>
                      <p className="mt-1 text-[11px] text-subtle">
                        Tempo médio de atendimento:{" "}
                        {Math.round(
                          ahtFor(f.channel, settings.data.aht_seconds, history.data).seconds / 60,
                        )}{" "}
                        min ({ahtFor(f.channel, settings.data.aht_seconds, history.data).source})
                      </p>
                    </li>
                  ))}
              </ul>
              <Button variant="ghost" size="sm" onClick={() => setHour(null)}>
                Ver o dia inteiro
              </Button>
            </div>
          ) : (
            <ul className="space-y-2.5 text-[13px]">
              {forecast.map((f) => (
                <li key={f.channel} className="flex items-baseline justify-between gap-3">
                  <span>{channelLabel(f.channel)}</span>
                  <span className="font-medium tabular-nums">
                    {formatNumber(f.total)}{" "}
                    <span className="text-[11px] font-normal text-subtle">
                      em {f.weeksUsed} sem.
                    </span>
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-2 pt-2 text-[12px] text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {hasChannel("phone") ? "Ligações e chat usam" : "As conversas usam"} a fórmula de
                Erlang C (fila em tempo real). Chamados contam como horas de trabalho.
              </li>
            </ul>
          )}
        </Panel>
      </div>

      <ShiftPlanner
        accountId={accountId}
        day={day}
        need={plan.map((p) => p.scheduled)}
        canEdit={canEdit}
      />
    </div>
  );
}

function SettingsForm({
  accountId,
  current,
  channels,
  onDone,
}: {
  accountId: string;
  current: WorkforceSettings;
  channels: string[];
  onDone: () => void;
}) {
  const save = useSaveWorkforceSettings(accountId);
  const [s, setS] = useState(current);
  const num = (v: string, min: number, max: number) =>
    Math.min(max, Math.max(min, Number(v) || min));
  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-border bg-surface-2 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(s, {
          onSuccess: () => {
            toast.success("Meta salva");
            onDone();
          },
          onError: (err) => toast.error(errorMessage(err)),
        });
      }}
    >
      <Field label="Atender quantos % dentro do prazo">
        <Input
          type="number"
          min={50}
          max={99}
          value={s.service_level_pct}
          onChange={(e) => setS({ ...s, service_level_pct: num(e.target.value, 50, 99) })}
        />
      </Field>
      <Field label="Prazo para atender (segundos)">
        <Input
          type="number"
          min={5}
          max={3600}
          value={s.answer_seconds}
          onChange={(e) => setS({ ...s, answer_seconds: num(e.target.value, 5, 3600) })}
        />
      </Field>
      <Field label="Pausa e ausência (%)">
        <Input
          type="number"
          min={0}
          max={70}
          value={s.shrinkage_pct}
          onChange={(e) => setS({ ...s, shrinkage_pct: num(e.target.value, 0, 70) })}
        />
      </Field>
      <Field label="Conversas de chat ao mesmo tempo por pessoa">
        <Input
          type="number"
          min={1}
          max={10}
          value={s.chat_concurrency}
          onChange={(e) => setS({ ...s, chat_concurrency: num(e.target.value, 1, 10) })}
        />
      </Field>
      <Field label="Semanas de histórico">
        <Input
          type="number"
          min={2}
          max={26}
          value={s.weeks_history}
          onChange={(e) => setS({ ...s, weeks_history: num(e.target.value, 2, 26) })}
        />
      </Field>
      <div className="sm:col-span-2">
        <p className="mb-2 text-[12px] text-muted-foreground">
          Tempo médio de atendimento em minutos (vazio = usa o histórico)
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {channels.map((ch) => (
            <Field key={ch} label={channelLabel(ch)}>
              <Input
                type="number"
                min={0}
                step="0.5"
                placeholder="automático"
                value={s.aht_seconds[ch] ? s.aht_seconds[ch]! / 60 : ""}
                onChange={(e) => {
                  const minutes = Number(e.target.value);
                  const next = { ...s.aht_seconds };
                  if (minutes > 0) next[ch] = Math.round(minutes * 60);
                  else delete next[ch];
                  setS({ ...s, aht_seconds: next });
                }}
              />
            </Field>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Salvar
        </Button>
      </div>
    </form>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
