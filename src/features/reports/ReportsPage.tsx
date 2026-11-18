import { EDITION, hasChannel, type Edition, type EditionChannel } from "@/lib/edition";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccount } from "@/lib/account";
import { cn } from "@/lib/utils";

import type { Range } from "./api";
import { ReportExportProvider } from "./export";
import { downloadCsv, type ExportTable } from "./export-csv";
import { AiTab } from "./tabs/AiTab";
import { AttributionTab } from "./tabs/AttributionTab";
import { BuilderTab } from "./tabs/BuilderTab";
import { ForecastTab } from "./tabs/ForecastTab";
import { CallsTab, MeetingsTab, ServiceTab } from "./tabs/OpsTab";
import { OperationTab } from "./tabs/OperationTab";
import { RevenueTab } from "./tabs/RevenueTab";
import { SalesTab } from "./tabs/SalesTab";
import { CustomersTab } from "@/features/gestao/tabs/CustomersTab";

export const REPORT_TABS = [
  "vendas",
  "forecast",
  "receita",
  "atribuicao",
  "atendimento",
  "carteira",
  "ligacoes",
  "reunioes",
  "operacao",
  "ia",
  "construtor",
] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

// Cada aba antiga (?aba=) continua valendo; aqui ela só ganha um grupo para quem lê.
const TAB_META: Record<ReportTab, { label: string; ranged: boolean }> = {
  vendas: { label: "Resultado", ranged: true },
  forecast: { label: "Previsão", ranged: false },
  receita: { label: "Receita recorrente", ranged: false },
  atribuicao: { label: "Origem dos contatos", ranged: true },
  atendimento: { label: "Chamados e satisfação", ranged: true },
  carteira: { label: "Saúde da carteira", ranged: false },
  ligacoes: { label: "Ligações", ranged: true },
  reunioes: { label: "Reuniões", ranged: true },
  operacao: { label: "Central e custos", ranged: true },
  ia: { label: "IA", ranged: false },
  construtor: { label: "Meus relatórios", ranged: false },
};

const ALL_GROUPS: { label: string; tabs: readonly ReportTab[] }[] = [
  { label: "Atendimento", tabs: ["atendimento", "ligacoes", "reunioes", "operacao"] },
  { label: "Carteira", tabs: ["carteira"] },
  { label: "IA", tabs: ["ia"] },
  { label: "Vendas", tabs: ["vendas", "forecast", "receita"] },
  { label: "Campanhas", tabs: ["atribuicao"] },
  { label: "Meus relatórios", tabs: ["construtor"] },
];

/** Abas que dependem de um canal: fora da edição, somem (ver src/lib/edition.ts). */
const TAB_CHANNEL: Partial<Record<ReportTab, EditionChannel>> = {
  ligacoes: "phone",
  // nível de serviço e ocupação da central telefônica
  operacao: "phone",
  reunioes: "video",
};

/**
 * Relatórios de venda e de captação (resultado, previsão, receita, origem): a central é de
 * pós-venda, então só aparecem na edição completa. O código das abas continua no repositório.
 */
const SALES_TABS: readonly ReportTab[] = ["vendas", "forecast", "receita", "atribuicao"];

export function reportTabVisible(tab: ReportTab, edition: Edition = EDITION): boolean {
  if (SALES_TABS.includes(tab) && !edition.allIntegrations) return false;
  const channel = TAB_CHANNEL[tab];
  return !channel || hasChannel(channel, edition);
}

/** Grupos e abas de relatório que a edição mostra (grupo sem aba some). */
export function reportGroupsFor(edition: Edition = EDITION) {
  return ALL_GROUPS.map((g) => ({
    ...g,
    tabs: g.tabs.filter((t) => reportTabVisible(t, edition)),
  })).filter((g) => g.tabs.length > 0);
}

const GROUPS = reportGroupsFor();

const PRESETS: { id: string; label: string; range: () => Range }[] = [
  {
    id: "month",
    label: "Este mês",
    range: () => between(new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date()),
  },
  {
    id: "last_month",
    label: "Mês passado",
    range: () =>
      between(
        new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
        new Date(new Date().getFullYear(), new Date().getMonth(), 0),
      ),
  },
  { id: "7", label: "Últimos 7 dias", range: () => between(daysAgo(6), new Date()) },
  { id: "30", label: "Últimos 30 dias", range: () => between(daysAgo(29), new Date()) },
  { id: "90", label: "Últimos 90 dias", range: () => between(daysAgo(89), new Date()) },
  {
    id: "year",
    label: "Este ano",
    range: () => between(new Date(new Date().getFullYear(), 0, 1), new Date()),
  },
];

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function between(a: Date, b: Date): Range {
  return { from: iso(a), to: iso(b) };
}

interface Props {
  tab: ReportTab;
  onTabChange: (t: ReportTab) => void;
  reportId?: string | undefined;
  /** Tela própria (Origem dos leads): só o relatório da aba, sem as abas de Relatórios. */
  standalone?: boolean;
}

// Relatórios em formato editorial: grupos por assunto, manchete com número e exportação do que está na tela.
export function ReportsPage({ tab: requested, onTabChange, reportId, standalone = false }: Props) {
  // endereço antigo de uma aba fora da edição (?aba=ligacoes) abre a primeira aba visível
  // a tela própria de Origem (recurso de captação) abre a aba dela mesmo fora do menu de relatórios
  const tab = standalone || reportTabVisible(requested) ? requested : GROUPS[0]!.tabs[0]!;
  const { current } = useAccount();
  const accountId = current!.accountId;
  const [preset, setPreset] = useState("month");
  const [exportable, setExportable] = useState<ExportTable | null>(null);
  const range = useMemo(() => PRESETS.find((p) => p.id === preset)!.range(), [preset]);
  const meta = TAB_META[tab];
  const group = GROUPS.find((g) => g.tabs.includes(tab)) ?? GROUPS[0]!;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 pt-6 sm:px-8 sm:pt-8 lg:px-10">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <p className="mb-1.5 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
              Resultados
            </p>
            <h1 className="font-display text-[26px] leading-tight font-medium text-foreground sm:text-[30px]">
              {tab === "atribuicao" ? "Origem dos contatos" : "Relatórios"}
            </h1>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {standalone
                ? "De onde vêm os contatos novos e qual campanha deu retorno"
                : "Atendimento, satisfação e carteira, em frases e números"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {meta.ranged && (
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="h-9 w-40" aria-label="Período">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {tab !== "construtor" && (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={!exportable || exportable.rows.length === 0}
                title={
                  exportable ? "Baixar a tabela deste relatório em CSV" : "Nada para exportar ainda"
                }
                onClick={() => exportable && downloadCsv(exportable)}
              >
                <Download aria-hidden /> Exportar
              </Button>
            )}
          </div>
        </div>
        {standalone ? (
          <div className="pb-4" />
        ) : (
          <nav aria-label="Relatórios" className="-mx-4 mt-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            <ul className="flex gap-6">
              {GROUPS.map((g) => {
                const active = g === group;
                return (
                  <li key={g.label}>
                    <button
                      type="button"
                      onClick={() => !active && onTabChange(g.tabs[0]!)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "-mb-px inline-flex border-b-2 pt-1 pb-3 text-[14px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active
                          ? "border-foreground font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {g.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {!standalone && group.tabs.length > 1 && (
            <nav aria-label={`Relatórios de ${group.label.toLowerCase()}`}>
              <ul className="flex flex-wrap gap-1.5">
                {group.tabs.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => onTabChange(t)}
                      aria-current={t === tab ? "page" : undefined}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12px] font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        t === tab
                          ? "border-primary bg-primary-soft text-foreground"
                          : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      {TAB_META[t].label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <ReportExportProvider onChange={setExportable}>
            {tab === "vendas" && <SalesTab accountId={accountId} range={range} />}
            {tab === "forecast" && <ForecastTab accountId={accountId} />}
            {tab === "atribuicao" && <AttributionTab accountId={accountId} range={range} />}
            {tab === "atendimento" && <ServiceTab accountId={accountId} range={range} />}
            {tab === "carteira" && <CustomersTab accountId={accountId} />}
            {tab === "ligacoes" && <CallsTab accountId={accountId} range={range} />}
            {tab === "reunioes" && <MeetingsTab accountId={accountId} range={range} />}
            {tab === "receita" && <RevenueTab accountId={accountId} />}
            {tab === "operacao" && <OperationTab accountId={accountId} range={range} />}
            {tab === "ia" && <AiTab accountId={accountId} />}
            {tab === "construtor" && (
              <BuilderTab accountId={accountId} range={range} initialReportId={reportId} />
            )}
          </ReportExportProvider>
        </div>
      </div>
    </div>
  );
}
