import { Link } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import {
  MOMENT_LABEL,
  formatDay,
  momentCounts,
  type MomentKey,
  type MomentResult,
} from "@/features/posvenda/moment";
import { MomentChip } from "@/features/posvenda/moment-ui";
import { formatNumber } from "@/lib/format";
import { countLabel } from "@/lib/plural";

import { Card, EmptyNote } from "./ui";

// Na ordem do risco: o que mais ameaça a venda primeiro.
const LINES: { key: MomentKey; hint: string }[] = [
  { key: "risco_cancelamento", hint: "nota baixa, reclamação, chamado atrasado ou cliente parado" },
  { key: "arrependimento", hint: "ainda podem desistir da compra" },
  { key: "renovacao", hint: "contrato renova em breve" },
  { key: "recompra", hint: "chegou a hora de comprar de novo" },
  { key: "garantia", hint: "dentro do prazo de garantia" },
];

interface Props {
  moments: Map<string, MomentResult>;
  names: Map<string, string>;
  isPending: boolean;
  isError: boolean;
  truncated: boolean;
  className?: string;
}

// Momentos da carteira: quantos clientes em cada momento do pós-venda, com atalho para a lista.
export function MomentsCard({ moments, names, isPending, isError, truncated, className }: Props) {
  const counts = momentCounts(moments.values());
  // quem vence o prazo de arrependimento primeiro: é a janela de maior risco de devolução
  const closing = [...moments.entries()]
    .filter(([, m]) => m.withdrawal?.active)
    .sort(([, a], [, b]) => a.withdrawal!.endsOn.localeCompare(b.withdrawal!.endsOn))
    .slice(0, 3);
  const dated = counts.total - counts.sem_data;

  return (
    <Card
      id="painel-momentos"
      eyebrow="Momentos da carteira"
      title={
        counts.total === 0
          ? "Onde cada cliente está depois da compra"
          : counts.arrependimento > 0
            ? `${countLabel(counts.arrependimento, "cliente")} no prazo de arrependimento`
            : counts.risco_cancelamento > 0
              ? `${countLabel(counts.risco_cancelamento, "cliente")} em risco de cancelamento`
              : "Ninguém no prazo de arrependimento nem em risco agora"
      }
      link={{ to: "/pos-venda", label: "Ajustar prazos do pós-venda" }}
      className={className}
    >
      {isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : isError ? (
        <EmptyNote>Não deu para carregar os momentos da carteira. Atualize a página.</EmptyNote>
      ) : counts.total === 0 ? (
        <EmptyNote>
          Nenhum cliente na carteira ainda. Quando um contato virar cliente, a data da compra passa
          a contar e ele aparece aqui: prazo de arrependimento, garantia, recompra e renovação.
        </EmptyNote>
      ) : (
        <>
          <ul className="-mx-2">
            {LINES.map((l) => (
              <li key={l.key}>
                <Link
                  to="/contatos"
                  search={{ momento: l.key }}
                  className="row-wash flex items-center gap-3 rounded-xl px-2 py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`${counts[l.key]} em ${MOMENT_LABEL[l.key]}. Abrir a lista filtrada.`}
                >
                  <span className="w-9 shrink-0 text-right font-display text-[20px] leading-none font-semibold tabular-nums">
                    {formatNumber(counts[l.key])}
                  </span>
                  <span className="min-w-0 flex-1">
                    <MomentChip momentKey={l.key} />
                    <span className="mt-1 block truncate text-[12px] text-muted-foreground">
                      {l.hint}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {closing.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1 text-[11px] font-medium text-subtle">
                Prazo de arrependimento vencendo primeiro
              </p>
              <ul className="-mx-2">
                {closing.map(([id, m]) => (
                  <li key={id}>
                    <Link
                      to="/contatos/$contactId"
                      params={{ contactId: id }}
                      className="row-wash flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="truncate font-medium text-foreground">
                        {names.get(id) ?? "Cliente sem nome"}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                        dia {m.withdrawal!.day} de {m.withdrawal!.of} · até{" "}
                        {formatDay(m.withdrawal!.endsOn).slice(0, 5)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-snug text-subtle">
            {counts.sem_data > 0
              ? `${countLabel(counts.sem_data, "cliente importado", "clientes importados")} sem data de compra ${counts.sem_data === 1 ? "fica" : "ficam"} fora da conta: informe a data na ficha. `
              : ""}
            {dated > 0 ? "Um cliente pode estar em mais de um momento. " : ""}
            {truncated ? "Contagem dos 2.000 clientes com conversa mais recente." : ""}
          </p>
        </>
      )}
    </Card>
  );
}
