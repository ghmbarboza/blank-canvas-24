import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { OriginChip } from "@/components/common/OriginChip";
import { sourceLabel } from "@/features/contacts/types";
import { formatMoney, formatNumber } from "@/lib/format";

import { useAttributionReport, type Range } from "../api";
import { useReportExport } from "../export-csv";
import { attributionHeadline } from "../headlines";
import { BarList, Lede, LoadingGrid, Panel, PerfTable } from "../ui";
import { countLabel } from "@/lib/plural";

// Atribuição: de onde vêm os leads (primeiro toque) e o que fecha a venda (último toque).
export function AttributionTab({ accountId, range }: { accountId: string; range: Range }) {
  const q = useAttributionReport(accountId, range);
  useReportExport(
    q.data
      ? {
          filename: `campanhas-e-origens-${range.from}-a-${range.to}`,
          headers: ["Campanha", "Origem", "Tipo", "Leads", "Em negociação", "Vendas", "Receita"],
          rows: [
            ...q.data.campaigns.map((c) => [
              c.campaign,
              sourceLabel(c.source),
              c.paid ? "Anúncio" : "Orgânico",
              c.leads,
              c.open_deals ?? 0,
              c.won ?? 0,
              c.revenue,
            ]),
            ...q.data.first_touch.map((s) => [
              "(sem campanha)",
              sourceLabel(s.source),
              "",
              s.leads,
              "",
              s.deals,
              s.revenue,
            ]),
          ],
        }
      : null,
  );
  if (q.isPending) return <LoadingGrid />;
  if (q.isError || !q.data)
    return <p className="text-[13px] text-danger">Não deu para carregar a atribuição.</p>;
  const r = q.data;
  if (r.first_touch.length === 0 && r.last_touch.length === 0)
    return (
      <EmptyState
        icon={Megaphone}
        title="Sem leads no período"
        description="Quando entrarem leads por formulário, anúncio, WhatsApp ou redes, a origem de cada um aparece aqui."
      />
    );
  const leads = r.first_touch.reduce((s, x) => s + x.leads, 0);

  return (
    <div className="space-y-6">
      <Lede eyebrow="Campanhas e origens" headline={attributionHeadline(r, sourceLabel)} />
      <Panel
        title="Campanhas: qual deu retorno"
        hint="Leads que cada campanha trouxe no período e o que viraram: negociação, venda e receita"
      >
        <PerfTable
          rows={r.campaigns}
          rowKey={(c) => `${c.source ?? ""}:${c.campaign}`}
          caption="Leads, vendas e receita por campanha"
          empty="Nenhum lead com campanha no período. Anúncios pela Zernio, formulários com UTM e links com ?utm_campaign= aparecem aqui."
          columns={[
            {
              label: "Campanha",
              render: (c) => (
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{c.campaign}</span>
                  <OriginChip
                    touch={{ source: c.source ?? null, medium: c.paid ? "paid" : "organic" }}
                    className="w-fit"
                  />
                </span>
              ),
            },
            { label: "Leads", numeric: true, render: (c) => formatNumber(c.leads) },
            {
              label: "Em negociação",
              numeric: true,
              render: (c) => (
                <span className="text-muted-foreground">{formatNumber(c.open_deals ?? 0)}</span>
              ),
            },
            { label: "Vendas", numeric: true, render: (c) => formatNumber(c.won ?? 0) },
            {
              label: "Receita",
              numeric: true,
              render: (c) => (
                <span className="font-medium">{formatMoney(Number(c.revenue), true)}</span>
              ),
            },
            {
              label: "Conversão",
              numeric: true,
              render: (c) => (
                <span className="text-muted-foreground">
                  {c.leads ? `${Math.round((100 * (c.won ?? 0)) / c.leads)}%` : "—"}
                </span>
              ),
            },
          ]}
        />
      </Panel>
      <Panel
        title="De onde vêm os leads"
        hint={`${countLabel(leads, "lead")} no período, com a receita que cada origem já gerou`}
      >
        <PerfTable
          rows={r.first_touch}
          rowKey={(s) => s.source}
          caption="Leads e receita por origem"
          empty="Nenhum lead no período."
          columns={[
            {
              label: "Origem",
              render: (s) => <span className="font-medium">{sourceLabel(s.source)}</span>,
            },
            { label: "Leads", numeric: true, render: (s) => formatNumber(s.leads) },
            {
              label: "% dos leads",
              numeric: true,
              render: (s) => (
                <span className="text-muted-foreground">
                  {leads ? Math.round((100 * s.leads) / leads) : 0}%
                </span>
              ),
            },
            { label: "Negócios ganhos", numeric: true, render: (s) => formatNumber(s.deals) },
            {
              label: "Receita",
              numeric: true,
              render: (s) => <span className="font-medium">{formatMoney(s.revenue, true)}</span>,
            },
            {
              label: "Receita por lead",
              numeric: true,
              render: (s) => (
                <span className="text-muted-foreground">
                  {s.leads ? formatMoney(s.revenue / s.leads, true) : "—"}
                </span>
              ),
            },
          ]}
        />
      </Panel>
      <div className="grid gap-4">
        <Panel
          title="Último toque: o que fechou a venda"
          hint="Receita ganha no período pela última origem registrada"
        >
          <BarList
            rows={r.last_touch.map((s) => ({
              label: sourceLabel(s.source),
              value: Number(s.revenue),
              sub: countLabel(s.deals, "negócio"),
            }))}
            format={(v) => formatMoney(v, true)}
            empty="Nenhum negócio ganho no período."
          />
        </Panel>
      </div>
    </div>
  );
}
