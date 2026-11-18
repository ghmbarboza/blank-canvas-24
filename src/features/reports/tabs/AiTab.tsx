import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Bot, Coins, Cpu, ShieldAlert } from "lucide-react";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";

import { useAiReport } from "../api";
import { useReportExport } from "../export-csv";
import { aiHeadline } from "../headlines";
import { BAR_RADIUS, GRID_PROPS } from "../chart-style";
import { BarList, Kpi, Lede, LoadingGrid, Panel } from "../ui";
import { monthLabel } from "../month-label";

const PURPOSE: Record<string, string> = {
  classify: "Classificação de leads",
  suggest: "Sugestão de resposta",
  reply: "Resposta automática",
  minutes: "Ata de reunião",
  coach: "Coach ao vivo",
  postcall: "Pós-chamada",
  interest: "Interesse em produto",
  lead_classification: "Classificação de leads",
  ask_nexus: "Assistente do Vínculo",
  agent_team: "Equipe de IA atendendo",
  agent_eval: "Teste dos agentes",
  agent_eval_judge: "Correção dos testes",
  agent_eval_generate: "Criação de testes",
  setup_agent: "Configuração com a Vi",
  "quality.evaluate": "Avaliação de qualidade",
  "quality.scenario": "Cenários de teste da qualidade",
  "quality.sweep": "Revisão de qualidade",
  "kb.draft": "Rascunho de artigo da base",
  "kb.embed": "Busca na base de conhecimento",
  embedding: "Busca na base de conhecimento",
  call_summary: "Resumo de ligação",
  call_coach: "Coach ao vivo",
  meeting_minutes: "Ata de reunião",
  agent_voice_note: "Áudio do agente",
  voice_agent_test: "Teste do agente de voz",
  "agent.test": "Teste do agente",
  "agent.simulate": "Simulador do agente",
  "agent.draft_from_text": "Agente criado por texto",
  "sac.macros": "Respostas prontas do SAC",
  sdr: "Pré-venda (SDR)",
  sac: "Atendimento (SAC)",
};

const KIND: Record<string, string> = {
  llm: "IA de texto",
  voice_ai_min: "Voz com IA (min)",
  phone_min: "Telefonia (min)",
  email: "E-mails",
  whatsapp_template: "Templates WhatsApp",
  meeting_min: "Reuniões (min)",
  transcription_min: "Transcrição (min)",
  sms: "SMS",
  other: "Outros",
};

const usd = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
const chartConfig = {
  calls: { label: "Chamadas à IA", color: "var(--chart-1)" },
  errors: { label: "Erros", color: "var(--chart-4)" },
} satisfies ChartConfig;

// IA: quanto a IA trabalhou, quanto custou (consumo) e quantas conversas resolveu sem humano.
export function AiTab({ accountId }: { accountId: string }) {
  const q = useAiReport(accountId, 6);
  useReportExport(
    q.data
      ? {
          filename: "ia-uso-por-mes",
          headers: ["Mês", "Chamadas à IA", "Erros", "Tokens de entrada", "Tokens de saída"],
          rows: q.data.llm_monthly.map((m) => [
            m.month,
            m.calls,
            m.errors,
            m.input_tokens,
            m.output_tokens,
          ]),
        }
      : null,
  );
  if (q.isPending) return <LoadingGrid />;
  if (q.isError || !q.data)
    return <p className="text-[13px] text-danger">Não deu para carregar o relatório de IA.</p>;
  const r = q.data;
  const calls = r.llm_monthly.reduce((s, m) => s + m.calls, 0);
  const errors = r.llm_monthly.reduce((s, m) => s + m.errors, 0);
  const tokens = r.llm_monthly.reduce((s, m) => s + m.input_tokens + m.output_tokens, 0);
  const cost = r.cost_monthly.reduce((s, c) => s + Number(c.cost_usd), 0);
  const byKind = new Map<string, number>();
  for (const c of r.cost_monthly)
    byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + Number(c.cost_usd));

  return (
    <div className="space-y-6">
      <Lede eyebrow="Últimos 6 meses" headline={aiHeadline(r)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          dark
          icon={Bot}
          label="Conversas resolvidas sem humano"
          value={r.resolution.rate === null ? "—" : `${r.resolution.rate}%`}
          sub={`${r.resolution.without_human} de ${r.resolution.with_ai} com IA`}
        />
        <Kpi
          icon={Cpu}
          label="Chamadas à IA (6 meses)"
          value={formatNumber(calls)}
          sub={`${formatNumber(tokens)} tokens`}
        />
        <Kpi
          icon={ShieldAlert}
          label="Taxa de erro"
          value={calls ? `${((100 * errors) / calls).toFixed(1).replace(".", ",")}%` : "—"}
          sub={`${errors} erro(s)`}
        />
        <Kpi
          icon={Coins}
          label="Consumo registrado"
          value={usd(cost)}
          sub="Voz, telefonia, e-mail, IA e mais"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Uso da IA por mês">
          <ChartContainer config={chartConfig} className="h-60 w-full">
            <BarChart data={r.llm_monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={36} />
              <ChartTooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={<ChartTooltipContent />}
              />
              <Bar dataKey="calls" stackId="a" fill="var(--color-calls)" maxBarSize={40} />
              <Bar
                dataKey="errors"
                stackId="a"
                fill="var(--color-errors)"
                radius={BAR_RADIUS}
                maxBarSize={40}
              />
            </BarChart>
          </ChartContainer>
        </Panel>
        <Panel title="Para que a IA foi usada">
          <BarList
            rows={r.by_purpose.map((p) => ({
              label: PURPOSE[p.purpose] ?? "Outros usos",
              value: p.calls,
              sub: `${Math.round(p.avg_latency_ms ?? 0)} ms`,
            }))}
            format={formatNumber}
            empty="A IA ainda não foi usada."
          />
        </Panel>
      </div>
      <Panel
        title="Consumo por tipo (US$)"
        hint="Somado da carteira de consumo: cada minuto de voz, telefonia, transcrição, e-mail e template fica registrado"
      >
        <BarList
          rows={[...byKind.entries()]
            .map(([k, v]) => ({ label: KIND[k] ?? "Outros", value: v }))
            .sort((a, b) => b.value - a.value)}
          format={usd}
          empty="Nenhum consumo registrado ainda."
        />
      </Panel>
    </div>
  );
}
