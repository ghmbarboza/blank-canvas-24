import { Link } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { HealthChip, type CustomerHealth } from "@/features/contacts/customer-health";
import { LEVEL_LABEL, portfolio, type HealthLevel } from "@/features/gestao/health";
import { formatNumber } from "@/lib/format";
import { countLabel } from "@/lib/plural";

import { Card, EmptyNote } from "./ui";

const SEGMENTS: { level: HealthLevel; className: string }[] = [
  { level: "healthy", className: "bg-primary" },
  { level: "attention", className: "bg-warm" },
  { level: "risk", className: "bg-danger" },
];

interface Props {
  rows: CustomerHealth[];
  isPending: boolean;
  isError: boolean;
  /** Gestor abre a tela Saúde da carteira; atendente vai para a lista de clientes. */
  canOpenHealth: boolean;
  className?: string;
}

// Saúde da carteira: quantos clientes estão bem, em atenção e em risco, e quem pede cuidado primeiro.
export function PortfolioCard({ rows, isPending, isError, canOpenHealth, className }: Props) {
  const sum = portfolio(rows);
  const worst = [...rows]
    .filter((r) => r.result.level !== "healthy")
    .sort((a, b) => a.result.score - b.result.score)
    .slice(0, 4);

  return (
    <Card
      id="painel-carteira"
      eyebrow="Saúde da carteira"
      title={
        sum.total === 0
          ? "Seus clientes ativos"
          : sum.risk > 0
            ? `${countLabel(sum.risk, "cliente")} em risco de ${formatNumber(sum.total)}`
            : `${countLabel(sum.total, "cliente ativo", "clientes ativos")}, nenhum em risco`
      }
      link={
        canOpenHealth
          ? { to: "/gestao", label: "Abrir saúde da carteira" }
          : { to: "/contatos", label: "Abrir clientes" }
      }
      className={className}
    >
      {isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : isError ? (
        <EmptyNote>Não deu para carregar a saúde da carteira. Atualize a página.</EmptyNote>
      ) : sum.total === 0 ? (
        <EmptyNote>
          Nenhum contato está marcado como cliente ainda. Abra um contato, mude a fase para Cliente
          e a saúde dele aparece aqui com o motivo.
        </EmptyNote>
      ) : (
        <>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={SEGMENTS.map((s) => `${sum[s.level]} ${LEVEL_LABEL[s.level]}`).join(", ")}
          >
            {SEGMENTS.map(
              (s) =>
                sum[s.level] > 0 && (
                  <span
                    key={s.level}
                    className={s.className}
                    style={{ width: `${(100 * sum[s.level]) / sum.total}%` }}
                  />
                ),
            )}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {SEGMENTS.map((s) => (
              <div key={s.level}>
                <dt className="flex items-center gap-1.5 text-[11px] text-subtle">
                  <span className={`size-2 rounded-full ${s.className}`} aria-hidden />
                  {LEVEL_LABEL[s.level]}
                </dt>
                <dd className="mt-0.5 font-display text-[24px] leading-none font-semibold tabular-nums">
                  {formatNumber(sum[s.level])}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 border-t border-border pt-3">
            {worst.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Todos saudáveis: conversa em dia, sem chamado aberto e sem nota baixa.
              </p>
            ) : (
              <>
                <p className="mb-1 text-[11px] font-medium text-subtle">
                  Quem pede cuidado primeiro
                </p>
                <ul className="-mx-2">
                  {worst.map((r) => (
                    <li key={r.signals.contact_id}>
                      <Link
                        to="/contatos/$contactId"
                        params={{ contactId: r.signals.contact_id }}
                        className="row-wash flex items-center gap-3 rounded-xl px-2 py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-foreground">
                            {r.signals.name ?? "Cliente sem nome"}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {r.result.factors.find((f) => f.points < 0)?.label ??
                              r.result.nextAction}
                          </span>
                        </span>
                        <HealthChip level={r.result.level} score={r.result.score} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
