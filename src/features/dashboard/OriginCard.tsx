import { useMemo } from "react";

import { OriginChip } from "@/components/common/OriginChip";
import { describeOrigin } from "@/features/contacts/origin";
import { useAttributionReport } from "@/features/reports/api";
import { formatMoney, formatNumber } from "@/lib/format";

import { Card, EmptyNote } from "./ui";
import { countLabel } from "@/lib/plural";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "De onde veio esse pessoal?" no Painel: as origens e as campanhas que trouxeram leads no período.
export function OriginCard({
  accountId,
  days,
  className,
}: {
  accountId: string;
  days: number;
  className?: string;
}) {
  const range = useMemo(
    () => ({ from: iso(new Date(Date.now() - (days - 1) * 86_400_000)), to: iso(new Date()) }),
    [days],
  );
  const q = useAttributionReport(accountId, range);
  const sources = (q.data?.first_touch ?? []).slice(0, 5);
  const campaigns = (q.data?.campaigns ?? []).slice(0, 3);
  const total = (q.data?.first_touch ?? []).reduce((s, x) => s + x.leads, 0);
  const top = sources[0];
  const topName = top ? (describeOrigin({ source: top.source })?.source ?? top.source) : null;

  return (
    <Card
      id="painel-origem"
      eyebrow="Origem dos leads"
      title={
        top && total
          ? `${topName} trouxe ${Math.round((100 * top.leads) / total)}% dos leads`
          : "De onde vêm os leads"
      }
      link={{ to: "/origem", label: "Ver campanhas" }}
      className={className}
    >
      {q.isPending ? (
        <EmptyNote>Carregando…</EmptyNote>
      ) : total === 0 ? (
        <EmptyNote>
          Quando alguém chegar por mensagem, anúncio ou formulário, a origem aparece aqui.
        </EmptyNote>
      ) : (
        <div className="space-y-4">
          <ul className="-mx-2 space-y-0.5">
            {sources.map((s) => (
              <li
                key={s.source}
                className="row-wash grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-2 py-2"
              >
                <div className="min-w-0">
                  <OriginChip touch={{ source: s.source, medium: s.paid ? "paid" : "organic" }} />
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                      style={{ width: `${(s.leads / total) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-24 text-right">
                  <p className="text-[13px] font-semibold tabular-nums">
                    {countLabel(s.leads, "lead")}
                  </p>
                  <p className="text-[11px] text-subtle tabular-nums">
                    {s.deals ? `${s.deals} venda${s.deals > 1 ? "s" : ""}` : "sem venda ainda"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {campaigns.length ? (
            <div>
              <p className="eyebrow mb-1.5 !text-[10px]">Campanhas que mais trouxeram</p>
              <ul className="space-y-1">
                {campaigns.map((c) => (
                  <li
                    key={`${c.source ?? ""}:${c.campaign}`}
                    className="flex items-center justify-between gap-3 text-[13px]"
                  >
                    <span className="min-w-0 truncate">{c.campaign}</span>
                    <span className="shrink-0 text-subtle tabular-nums">
                      {countLabel(c.leads, "lead")} · {formatMoney(Number(c.revenue), true)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
