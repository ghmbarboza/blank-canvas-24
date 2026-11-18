// Lógica pura dos relatórios (navegador e servidor): configuração do construtor, CSV e e-mail.
export type ReportEntity = "contacts" | "deals" | "activities";
export type ReportMetric = "count" | "sum_value" | "avg_value" | "avg_score";
export type ReportChart = "bar" | "line" | "pie" | "table";

export interface ReportFilter {
  field: string;
  value: string;
}

export interface ReportConfig {
  entity: ReportEntity;
  group_by: string;
  metric: ReportMetric;
  date_field?: string;
  from?: string;
  to?: string;
  filters?: ReportFilter[];
}

export interface ReportRow {
  key: string;
  label: string;
  value: number;
}

export const ENTITY_LABEL: Record<ReportEntity, string> = {
  contacts: "Contatos",
  deals: "Negócios",
  activities: "Atividades",
};

export const GROUPS: Record<ReportEntity, { id: string; label: string }[]> = {
  contacts: [
    { id: "none", label: "Total" },
    { id: "month", label: "Mês de entrada" },
    { id: "week", label: "Semana de entrada" },
    { id: "source", label: "Origem" },
    { id: "lifecycle", label: "Fase" },
    { id: "temperature", label: "Temperatura" },
    { id: "owner_user_id", label: "Responsável" },
    { id: "city", label: "Cidade" },
    { id: "company_id", label: "Empresa" },
  ],
  deals: [
    { id: "none", label: "Total" },
    { id: "month", label: "Mês" },
    { id: "week", label: "Semana" },
    { id: "status", label: "Situação" },
    { id: "stage_id", label: "Etapa" },
    { id: "pipeline_id", label: "Funil" },
    { id: "owner_user_id", label: "Vendedor" },
    { id: "source", label: "Origem" },
    { id: "lost_reason", label: "Motivo de perda" },
  ],
  activities: [
    { id: "none", label: "Total" },
    { id: "month", label: "Mês" },
    { id: "week", label: "Semana" },
    { id: "type", label: "Tipo" },
    { id: "user_id", label: "Pessoa" },
    { id: "done", label: "Feita ou pendente" },
  ],
};

export const METRICS: Record<ReportEntity, { id: ReportMetric; label: string }[]> = {
  contacts: [
    { id: "count", label: "Quantidade" },
    { id: "avg_score", label: "Score médio" },
  ],
  deals: [
    { id: "count", label: "Quantidade" },
    { id: "sum_value", label: "Valor total" },
    { id: "avg_value", label: "Ticket médio" },
  ],
  activities: [{ id: "count", label: "Quantidade" }],
};

export const DATE_FIELDS: Record<ReportEntity, { id: string; label: string }[]> = {
  contacts: [{ id: "created_at", label: "Data de entrada" }],
  deals: [
    { id: "created_at", label: "Criação" },
    { id: "closed_at", label: "Fechamento" },
  ],
  activities: [
    { id: "created_at", label: "Criação" },
    { id: "done_at", label: "Conclusão" },
    { id: "due_at", label: "Prazo" },
  ],
};

export const VALUE_LABEL: Record<string, string> = {
  open: "Aberto",
  won: "Ganho",
  lost: "Perdido",
  lead: "Lead",
  opportunity: "Oportunidade",
  customer: "Cliente",
  inactive: "Inativo",
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
  sem: "Sem temperatura",
  note: "Nota",
  call: "Ligação",
  task: "Tarefa",
  email: "E-mail",
  meeting: "Reunião",
  whatsapp: "WhatsApp",
  stage_change: "Mudança de etapa",
  ai: "IA",
  system: "Sistema",
  pendente: "Pendente",
  feita: "Feita",
};

export function displayLabel(row: ReportRow): string {
  return VALUE_LABEL[row.label] ?? row.label;
}

export function isMoneyMetric(metric: ReportMetric): boolean {
  return metric === "sum_value" || metric === "avg_value";
}

export function formatMetric(metric: ReportMetric, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (isMoneyMetric(metric))
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(v);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v);
}

// Configuração válida: grupo e métrica precisam existir para a entidade (o banco valida de novo).
export function normalizeConfig(c: Partial<ReportConfig>): ReportConfig {
  const entity: ReportEntity = c.entity && c.entity in GROUPS ? c.entity : "deals";
  const group = GROUPS[entity].some((g) => g.id === c.group_by) ? c.group_by! : "none";
  const metric = METRICS[entity].some((m) => m.id === c.metric) ? c.metric! : "count";
  const dateField = DATE_FIELDS[entity].some((d) => d.id === c.date_field)
    ? c.date_field!
    : "created_at";
  return {
    entity,
    group_by: group,
    metric,
    date_field: dateField,
    ...(c.from ? { from: c.from } : {}),
    ...(c.to ? { to: c.to } : {}),
    filters: (c.filters ?? []).filter((f) => f.field && f.value).slice(0, 8),
  };
}

export const BOM = String.fromCharCode(0xfeff);

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV no padrão do Excel brasileiro (separador ponto e vírgula, decimal com vírgula, BOM).
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((r) =>
    r
      .map((c) => (typeof c === "number" ? csvCell(String(c).replace(".", ",")) : csvCell(c)))
      .join(";"),
  );
  return `${BOM}${lines.join("\r\n")}`;
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!,
  );
}

// E-mail semanal do relatório salvo: tabela simples, legível em qualquer cliente de e-mail.
export function reportEmailHtml(
  name: string,
  config: ReportConfig,
  rows: ReportRow[],
  link: string,
): string {
  const groupLabel = GROUPS[config.entity].find((g) => g.id === config.group_by)?.label ?? "";
  const metricLabel = METRICS[config.entity].find((m) => m.id === config.metric)?.label ?? "";
  const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  const body = rows
    .slice(0, 25)
    .map(
      (
        r,
      ) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eef1f5">${esc(displayLabel(r))}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eef1f5;width:45%"><div style="background:#0A1F3B;height:8px;border-radius:4px;width:${Math.max(2, Math.round((100 * (Number(r.value) || 0)) / max))}%"></div></td>
<td style="padding:6px 8px;border-bottom:1px solid #eef1f5;text-align:right;font-variant-numeric:tabular-nums">${esc(formatMetric(config.metric, Number(r.value)))}</td></tr>`,
    )
    .join("");
  return `<div style="font-family:Geist,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0A1F3B">
<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5b6b80">Relatório semanal</p>
<h1 style="font-size:22px;margin:4px 0 4px">${esc(name)}</h1>
<p style="color:#5b6b80;font-size:13px;margin:0 0 18px">${esc(ENTITY_LABEL[config.entity])} · ${esc(metricLabel)} por ${esc(groupLabel.toLowerCase())}</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">${body || '<tr><td style="padding:12px;color:#5b6b80">Nada neste período.</td></tr>'}</table>
<p style="margin:24px 0"><a href="${link}" style="background:#0A1F3B;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">Abrir no Nexus</a></p></div>`;
}

export function monthRange(d = new Date()): { from: string; to: string } {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

export function pct(achieved: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.round((achieved / target) * 1000) / 10;
}

// Ritmo: quanto deveria estar feito hoje para bater a meta no fim do mês.
export function expectedByToday(target: number, d = new Date()): number {
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return (target * d.getDate()) / days;
}
