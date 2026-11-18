import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Download, Loader2, Mail, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  useDeleteReport,
  useRunReport,
  useSaveReport,
  useSavedReports,
  type Range,
  type SavedReport,
} from "../api";
import {
  DATE_FIELDS,
  ENTITY_LABEL,
  GROUPS,
  METRICS,
  displayLabel,
  formatMetric,
  normalizeConfig,
  toCsv,
  type ReportChart,
  type ReportConfig,
  type ReportEntity,
} from "../lib";
import { Panel } from "../ui";

const FILTERABLE: Record<
  ReportEntity,
  { id: string; label: string; options?: { value: string; label: string }[] }[]
> = {
  contacts: [
    {
      id: "lifecycle",
      label: "Fase",
      options: [
        { value: "lead", label: "Lead" },
        { value: "opportunity", label: "Oportunidade" },
        { value: "customer", label: "Cliente" },
        { value: "inactive", label: "Inativo" },
      ],
    },
    {
      id: "temperature",
      label: "Temperatura",
      options: [
        { value: "hot", label: "Quente" },
        { value: "warm", label: "Morno" },
        { value: "cold", label: "Frio" },
      ],
    },
    { id: "source", label: "Origem" },
    { id: "city", label: "Cidade" },
  ],
  deals: [
    {
      id: "status",
      label: "Situação",
      options: [
        { value: "open", label: "Aberto" },
        { value: "won", label: "Ganho" },
        { value: "lost", label: "Perdido" },
      ],
    },
    { id: "source", label: "Origem" },
  ],
  activities: [
    {
      id: "type",
      label: "Tipo",
      options: [
        { value: "call", label: "Ligação" },
        { value: "task", label: "Tarefa" },
        { value: "email", label: "E-mail" },
        { value: "meeting", label: "Reunião" },
        { value: "note", label: "Nota" },
        { value: "whatsapp", label: "WhatsApp" },
      ],
    },
  ],
};

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const CHARTS: { id: ReportChart; label: string }[] = [
  { id: "bar", label: "Barras" },
  { id: "line", label: "Linha" },
  { id: "pie", label: "Pizza" },
  { id: "table", label: "Tabela" },
];

// Construtor de relatório: escolhe o que contar, como agrupar e como ver. Salva, compartilha e agenda por e-mail.
export function BuilderTab({
  accountId,
  range,
  initialReportId,
}: {
  accountId: string;
  range: Range;
  initialReportId?: string | undefined;
}) {
  const saved = useSavedReports(accountId);
  const save = useSaveReport(accountId);
  const del = useDeleteReport(accountId);
  const [config, setConfig] = useState<ReportConfig>(
    normalizeConfig({ entity: "deals", group_by: "status", metric: "sum_value", ...range }),
  );
  const [chart, setChart] = useState<ReportChart>("bar");
  const [current, setCurrent] = useState<SavedReport | null>(null);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [weekly, setWeekly] = useState(false);
  const [recipients, setRecipients] = useState("");
  const result = useRunReport(accountId, config);
  const rows = result.data ?? [];

  function load(r: SavedReport) {
    setCurrent(r);
    setConfig(normalizeConfig(r.config));
    setChart(r.chart);
    setName(r.name);
    setShared(r.is_shared);
    setWeekly(r.schedule === "weekly");
    setRecipients(r.recipients.join(", "));
  }

  useEffect(() => {
    if (!initialReportId || current) return;
    const r = saved.data?.find((s) => s.id === initialReportId);
    if (r) load(r);
  }, [initialReportId, saved.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<ReportConfig>) =>
    setConfig((c) => normalizeConfig({ ...c, ...patch }));
  const chartConfig = useMemo(
    () =>
      ({
        value: {
          label: METRICS[config.entity].find((m) => m.id === config.metric)?.label ?? "Valor",
          color: "var(--chart-1)",
        },
      }) satisfies ChartConfig,
    [config],
  );
  const data = rows.map((r) => ({ ...r, name: displayLabel(r) }));

  async function persist() {
    if (!name.trim()) {
      toast.error("Dê um nome ao relatório");
      return;
    }
    const list = recipients
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (weekly && (list.length === 0 || list.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))) {
      toast.error("Informe e-mails válidos para o envio semanal");
      return;
    }
    try {
      const { from: _f, to: _t, ...rest } = config;
      const row = await save.mutateAsync({
        ...(current ? { id: current.id } : {}),
        name: name.trim(),
        config: rest,
        chart,
        is_shared: shared,
        schedule: weekly ? "weekly" : "none",
        recipients: weekly ? list : [],
      });
      setCurrent(row as unknown as SavedReport);
      toast.success(
        weekly ? "Relatório salvo. Chega por e-mail toda segunda de manhã." : "Relatório salvo",
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function exportCsv() {
    const metric = METRICS[config.entity].find((m) => m.id === config.metric)?.label ?? "Valor";
    const group = GROUPS[config.entity].find((g) => g.id === config.group_by)?.label ?? "Grupo";
    const csv = toCsv(
      [group, metric],
      data.map((r) => [r.name, r.value]),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${(name || "relatorio").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Panel title="Montar relatório">
          <div className="grid gap-3">
            <Field label="O que analisar">
              <Select
                value={config.entity}
                onValueChange={(v) =>
                  update({
                    entity: v as ReportEntity,
                    group_by: "none",
                    metric: "count",
                    filters: [],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ENTITY_LABEL) as ReportEntity[]).map((e) => (
                    <SelectItem key={e} value={e}>
                      {ENTITY_LABEL[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Medir">
              <Select
                value={config.metric}
                onValueChange={(v) => update({ metric: v as ReportConfig["metric"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS[config.entity].map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Agrupar por">
              <Select value={config.group_by} onValueChange={(v) => update({ group_by: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS[config.entity].map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Período pela data de">
              <Select
                value={config.date_field ?? "created_at"}
                onValueChange={(v) => update({ date_field: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FIELDS[config.entity].map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label="De">
                <Input
                  type="date"
                  className="min-w-0"
                  value={config.from ?? ""}
                  onChange={(e) => update({ from: e.target.value })}
                />
              </Field>
              <Field label="Até">
                <Input
                  type="date"
                  className="min-w-0"
                  value={config.to ?? ""}
                  onChange={(e) => update({ to: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-2">
              <Label className="text-[12px] text-muted-foreground">Filtros</Label>
              {(config.filters ?? []).map((f, i) => {
                const def = FILTERABLE[config.entity].find((x) => x.id === f.field);
                return (
                  <div key={i} className="flex items-center gap-2 text-[12px]">
                    <span className="w-24 shrink-0 text-subtle">{def?.label ?? f.field}</span>
                    <span className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1">
                      {def?.options?.find((o) => o.value === f.value)?.label ?? f.value}
                    </span>
                    <button
                      type="button"
                      aria-label="Remover filtro"
                      onClick={() =>
                        update({ filters: (config.filters ?? []).filter((_, j) => j !== i) })
                      }
                      className="text-subtle hover:text-danger"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
              <AddFilter
                entity={config.entity}
                onAdd={(field, value) =>
                  update({ filters: [...(config.filters ?? []), { field, value }] })
                }
              />
            </div>
          </div>
        </Panel>

        <Panel title="Salvos">
          {(saved.data ?? []).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Nenhum relatório salvo ainda.</p>
          ) : (
            <ul className="space-y-1">
              {(saved.data ?? []).map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl px-2 py-1.5",
                    current?.id === r.id ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => load(r)}
                    className="min-w-0 flex-1 truncate text-left text-[13px]"
                  >
                    {r.name}
                    {r.schedule === "weekly" && (
                      <Mail
                        className="ml-1.5 inline size-3 text-subtle"
                        aria-label="envio semanal"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${r.name}`}
                    onClick={() =>
                      del.mutate(r.id, {
                        onSuccess: () => {
                          if (current?.id === r.id) setCurrent(null);
                        },
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }
                    className="text-subtle opacity-0 group-hover:opacity-100 hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setCurrent(null);
              setName("");
              setWeekly(false);
              setRecipients("");
            }}
          >
            <Plus /> Novo relatório
          </Button>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel
          title={name || "Resultado"}
          aside={
            <div className="flex flex-wrap gap-1">
              {CHARTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChart(c.id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px]",
                    chart === c.id
                      ? "bg-primary-soft font-medium text-foreground ring-1 ring-primary-line"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  {c.label}
                </button>
              ))}
              <Button size="sm" variant="ghost" onClick={exportCsv} disabled={rows.length === 0}>
                <Download /> CSV
              </Button>
            </div>
          }
        >
          {result.isFetching && rows.length === 0 ? (
            <Loader2 className="mx-auto my-16 animate-spin text-subtle" />
          ) : result.isError ? (
            <p className="py-10 text-center text-[13px] text-danger">
              {errorMessage(result.error)}
            </p>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <BarChart3 className="mx-auto size-6 text-subtle" />
              <p className="mt-2 text-[13px] text-muted-foreground">
                Nenhum resultado com esses filtros. Tire um filtro ou aumente o período.
              </p>
            </div>
          ) : chart === "table" ? (
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-border">
                {data.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatMetric(config.metric, r.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ChartContainer config={chartConfig} className="h-80 w-full">
              {chart === "pie" ? (
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={2}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              ) : chart === "line" ? (
                <LineChart data={data}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={56}
                    tickFormatter={(v: number) => formatMetric(config.metric, v)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="value"
                    stroke="var(--color-value)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    interval={0}
                    angle={data.length > 6 ? -25 : 0}
                    textAnchor={data.length > 6 ? "end" : "middle"}
                    height={data.length > 6 ? 60 : 30}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={56}
                    tickFormatter={(v: number) => formatMetric(config.metric, v)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ChartContainer>
          )}
        </Panel>

        <Panel title="Salvar e compartilhar">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do relatório">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Receita por vendedor"
              />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 text-[13px]">
              Visível para a equipe
              <Switch checked={shared} onCheckedChange={setShared} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-[13px]">
              Enviar por e-mail toda segunda
              <Switch checked={weekly} onCheckedChange={setWeekly} />
            </label>
            {weekly && (
              <Field label="Para quem (separe por vírgula)">
                <Input
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="diretoria@empresa.com.br"
                />
              </Field>
            )}
          </div>
          <Button className="mt-4" onClick={() => void persist()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}{" "}
            {current ? "Atualizar relatório" : "Salvar relatório"}
          </Button>
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function AddFilter({
  entity,
  onAdd,
}: {
  entity: ReportEntity;
  onAdd: (field: string, value: string) => void;
}) {
  const fields = FILTERABLE[entity];
  const [field, setField] = useState(fields[0]?.id ?? "");
  const [value, setValue] = useState("");
  useEffect(() => {
    setField(fields[0]?.id ?? "");
    setValue("");
  }, [entity]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = fields.find((f) => f.id === field);
  if (!def) return null;
  return (
    <div className="flex gap-1.5">
      <Select
        value={field}
        onValueChange={(v) => {
          setField(v);
          setValue("");
        }}
      >
        <SelectTrigger className="h-8 w-28 text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {def.options ? (
        <Select {...(value ? { value } : {})} onValueChange={setValue}>
          <SelectTrigger className="h-8 min-w-0 flex-1 text-[12px]">
            <SelectValue placeholder="Valor" />
          </SelectTrigger>
          <SelectContent>
            {def.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          className="h-8 min-w-0 flex-1 text-[12px]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Valor exato"
        />
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={!value}
        onClick={() => {
          onAdd(field, value);
          setValue("");
        }}
      >
        <Plus />
      </Button>
    </div>
  );
}
