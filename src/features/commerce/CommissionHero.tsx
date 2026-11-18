import { Info, TrendingUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/integrations/supabase/types";
import { formatMoney } from "@/lib/format";

import type { CommissionTotals } from "./api";

type Rule = Tables<"commission_rules">;

type Props = {
  totals: CommissionTotals | undefined;
  isLoading: boolean;
  wonValue: number | undefined;
  rules: Rule[] | undefined;
  names: Map<string, string>;
};

function splitMoney(v: number): { whole: string; cents: string } {
  const [whole = "0", cents = "00"] = v
    .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(",");
  return { whole, cents };
}

function ruleScope(r: Rule, names: Map<string, string>): string {
  const who = r.user_id ? (names.get(r.user_id) ?? "uma pessoa") : null;
  const what = r.product_id ? "um produto" : r.category ? `a categoria ${r.category}` : null;
  if (who && what) return `${who}, em ${what}`;
  return who ?? (what ? `em ${what}` : "todos os negócios");
}

// Destaque da tela: quanto de comissão o mês já gerou e a regra em linguagem simples.
export function CommissionHero({ totals, isLoading, wonValue, rules, names }: Props) {
  // Mês sem venda e sem comissão: o "Desempenho da equipe" logo abaixo já diz o que falta;
  // um segundo aviso de "sem dados" aqui seria ruído.
  if (!isLoading && !totals?.total && !wonValue) return null;
  const { whole, cents } = splitMoney(totals?.total ?? 0);
  const active = (rules ?? []).filter((r) => r.active);
  const general = active.find((r) => !r.user_id && !r.product_id && !r.category);
  const specific = active.filter((r) => r !== general);

  return (
    <section
      aria-label="Comissão do mês"
      className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10"
    >
      <div className="atmosphere rounded-xl border border-border bg-surface p-6">
        <p className="eyebrow">Comissão gerada no mês</p>
        {isLoading ? (
          <Skeleton className="mt-4 h-14 w-56 rounded-lg" />
        ) : !totals?.total ? (
          <p className="mt-3 text-[15px] text-muted-foreground">
            Nenhuma comissão neste mês ainda. Ela aparece aqui quando um negócio for ganho com uma
            regra de comissão ativa.
          </p>
        ) : (
          <p className="mt-3 flex items-baseline gap-1.5 font-display tabular-nums">
            <span className="text-[20px] text-subtle">R$</span>
            <span className="text-5xl font-semibold sm:text-6xl">{whole}</span>
            <span className="text-[20px] text-subtle">,{cents}</span>
          </p>
        )}
        <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-[13px] text-muted-foreground">
          <p className="flex items-center gap-2">
            <TrendingUp className="size-4 text-subtle" aria-hidden />
            <span>
              Sobre{" "}
              <strong className="font-semibold text-foreground tabular-nums">
                {formatMoney(totals?.base ?? 0)}
              </strong>{" "}
              em vendas comissionadas
            </span>
          </p>
          {totals && totals.total > 0 && (
            <p className="pl-6 tabular-nums">
              {formatMoney(totals.pending)} a pagar · {formatMoney(totals.paid)} já pago
            </p>
          )}
          {wonValue !== undefined && totals && wonValue > totals.base && (
            <p className="pl-6 text-[12px] text-subtle">
              O time fechou {formatMoney(wonValue, true)} no mês; o que não tem regra não gera
              comissão.
            </p>
          )}
        </div>
      </div>

      <div className="lg:border-l lg:border-border lg:pl-10">
        <h2 className="flex items-center gap-2 font-display text-[17px] font-medium">
          <Info className="size-4 text-subtle" aria-hidden /> Como a comissão é calculada
        </h2>
        {rules === undefined ? (
          <Skeleton className="mt-4 h-20 w-full rounded-lg" />
        ) : active.length === 0 ? (
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            Nenhuma regra ativa: os negócios ganhos ainda não geram comissão. O gestor cria a regra
            na aba Regras de comissão.
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-muted-foreground">
            {general && (
              <p>
                A cada negócio ganho, quem vendeu recebe{" "}
                <strong className="font-semibold text-foreground">
                  {Number(general.percent)}% de comissão
                </strong>{" "}
                sobre o valor de cada item.
              </p>
            )}
            {specific.length > 0 && (
              <p>
                {general ? "Vale a regra mais específica quando houver: " : "Regras em vigor: "}
                pessoa e produto vencem produto, que vence categoria, que vence a regra geral.
              </p>
            )}
            <p>Se o negócio for reaberto, a comissão que ainda não foi paga é cancelada.</p>
            <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Regras ativas">
              {active.map((r) => (
                <li
                  key={r.id}
                  className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {r.name}: {Number(r.percent)}%
                  <span className="text-subtle"> · {ruleScope(r, names)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
