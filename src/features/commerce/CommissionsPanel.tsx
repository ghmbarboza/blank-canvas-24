import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useCommissions, useMarkCommissionPaid } from "./api";

// Lançamentos de comissão do mês, com marcar como pagas (gestor).
export function CommissionsPanel({
  accountId,
  range,
  names,
  isManager,
}: {
  accountId: string;
  range: { from: string; to: string };
  names: Map<string, string>;
  isManager: boolean;
}) {
  const list = useCommissions(accountId, range);
  const markPaid = useMarkCommissionPaid(accountId);
  const [selected, setSelected] = useState<string[]>([]);
  const rows = useMemo(() => list.data ?? [], [list.data]);
  const pending = rows.filter((r) => r.status === "pending");
  const sum = (xs: typeof rows) => xs.reduce((s, r) => s + Number(r.amount), 0);
  const byUser = useMemo(() => {
    const m = new Map<string, { pending: number; paid: number }>();
    for (const r of rows) {
      const cur = m.get(r.user_id) ?? { pending: 0, paid: 0 };
      if (r.status === "pending") cur.pending += Number(r.amount);
      else cur.paid += Number(r.amount);
      m.set(r.user_id, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].pending + b[1].paid - (a[1].pending + a[1].paid));
  }, [rows]);

  if (list.isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Wallet}
        title="Nenhuma comissão neste mês"
        description="A comissão é calculada sozinha quando um negócio vira ganho, pelas regras definidas pelo gestor."
      />
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="A pagar" value={formatMoney(sum(pending))} />
        <Kpi label="Já pago" value={formatMoney(sum(rows.filter((r) => r.status === "paid")))} />
        <Kpi
          label="Negócios comissionados"
          value={String(new Set(rows.map((r) => r.deal_id)).size)}
        />
      </div>
      {isManager && byUser.length > 1 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <p className="eyebrow mb-3">Por pessoa</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {byUser.map(([uid, v]) => (
              <li
                key={uid}
                className="flex justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-[13px]"
              >
                <span>{names.get(uid) ?? "Vendedor"}</span>
                <span className="tabular-nums">
                  {formatMoney(v.pending)} <span className="text-subtle">a pagar</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-xl border border-border bg-surface">
        {isManager && selected.length > 0 && (
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[12px] text-muted-foreground">
              {selected.length} selecionada(s)
            </span>
            <Button
              size="sm"
              disabled={markPaid.isPending}
              onClick={() =>
                markPaid.mutate(selected, {
                  onSuccess: () => {
                    setSelected([]);
                    toast.success("Comissões marcadas como pagas");
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Marcar como pagas
            </Button>
          </div>
        )}
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const deal = r.deals as unknown as { title: string } | null;
            const rule = r.commission_rules as unknown as { name: string } | null;
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                {isManager && r.status === "pending" ? (
                  <Checkbox
                    checked={selected.includes(r.id)}
                    onCheckedChange={(c) =>
                      setSelected((s) => (c ? [...s, r.id] : s.filter((x) => x !== r.id)))
                    }
                    aria-label="Selecionar comissão"
                  />
                ) : (
                  <span className="size-4" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{deal?.title ?? "Negócio"}</p>
                  <p className="truncate text-[11px] text-subtle">
                    {names.get(r.user_id) ?? "Vendedor"} · {rule?.name ?? "Regra"} ·{" "}
                    {Number(r.percent)}% sobre {formatMoney(r.base)}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    r.status === "paid"
                      ? "bg-primary-soft text-foreground"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {r.status === "paid" ? "Paga" : "A pagar"}
                </span>
                <span className="w-24 text-right font-semibold tabular-nums">
                  {formatMoney(r.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <p className="font-display text-[22px] font-semibold tabular-nums">{value}</p>
      <p className="text-[12px] text-subtle">{label}</p>
    </div>
  );
}
