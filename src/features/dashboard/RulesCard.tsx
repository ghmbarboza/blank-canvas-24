import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { countLabel } from "@/lib/plural";
import { cn } from "@/lib/utils";

import type { RulesSummary } from "./overview";
import { Card, EmptyNote } from "./ui";

interface Props {
  rules: RulesSummary;
  isPending: boolean;
  isError: boolean;
  className?: string;
}

// Regras de pós-venda: quais estão ligadas e quantos clientes já passaram por cada uma.
export function RulesCard({ rules, isPending, isError, className }: Props) {
  return (
    <Card
      id="painel-regras"
      eyebrow="Regras de pós-venda"
      title={
        rules.on === 0
          ? "Nenhuma regra ligada ainda"
          : `${rules.on} de ${rules.total} ligadas, ${countLabel(rules.reached, "cliente")} já ${rules.reached === 1 ? "passou" : "passaram"} por elas`
      }
      link={{ to: "/pos-venda", label: rules.on === 0 ? "Ligar a primeira regra" : "Abrir regras" }}
      className={className}
    >
      {isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : isError ? (
        <EmptyNote>Não deu para carregar as regras. Atualize a página.</EmptyNote>
      ) : (
        <ul className="-mx-2">
          {rules.lines.map((l) => (
            <li key={l.key} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-[13px]">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  l.on ? "bg-gold" : "border border-border-strong bg-transparent",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  l.on ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {l.title}
              </span>
              <span className="shrink-0 text-[12px] text-subtle tabular-nums">
                {l.on
                  ? l.reached > 0
                    ? `${formatNumber(l.reached)} ${l.reached === 1 ? "cliente" : "clientes"}`
                    : "ligada, ninguém passou ainda"
                  : l.reached > 0
                    ? `desligada · ${formatNumber(l.reached)} antes`
                    : "desligada"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
