import { Link } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, reviewsSummary, type ReviewEntry } from "@/features/posvenda/moment";
import { BRAND } from "@/lib/brand";
import { formatNumber } from "@/lib/format";
import { countLabel } from "@/lib/plural";

import { Card, EmptyNote } from "./ui";

interface Props {
  reviews: Map<string, ReviewEntry[]>;
  names: Map<string, string>;
  isPending: boolean;
  isError: boolean;
  className?: string;
}

// Avaliações públicas (Google e Reclame Aqui): o que a equipe registrou na ficha de cada cliente.
export function ReviewsCard({ reviews, names, isPending, isError, className }: Props) {
  const sum = reviewsSummary([...reviews.values()]);
  const open = [...reviews.entries()]
    .flatMap(([id, list]) =>
      list
        .filter((e) => e.kind === "reclame_aqui" && e.status === "aberta")
        .map((e) => ({ id, e })),
    )
    .sort((a, b) => a.e.at.localeCompare(b.e.at))
    .slice(0, 3);
  const empty = sum.pedidos + sum.avaliacoes + sum.reclamacoes === 0;

  return (
    <Card
      id="painel-avaliacoes"
      eyebrow="Avaliações · Google e Reclame Aqui"
      title={
        empty
          ? "Nenhuma avaliação registrada ainda"
          : sum.reclamacoesAbertas > 0
            ? `${countLabel(sum.reclamacoesAbertas, "reclamação aberta", "reclamações abertas")} no Reclame Aqui`
            : `${countLabel(sum.avaliacoes, "avaliação registrada", "avaliações registradas")}, nenhuma reclamação aberta`
      }
      link={{ to: "/pos-venda", label: "Links de avaliação da empresa" }}
      className={className}
    >
      {isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : isError ? (
        <EmptyNote>Não deu para carregar as avaliações. Atualize a página.</EmptyNote>
      ) : empty ? (
        <EmptyNote>
          Quando pedir uma avaliação, ou quando um cliente avaliar no Google ou reclamar no Reclame
          Aqui, registre na ficha dele. A contagem aparece aqui.
        </EmptyNote>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <div>
              <dt className="text-[11px] text-subtle">Pedidos enviados</dt>
              <dd className="mt-0.5 font-display text-[24px] leading-none font-semibold tabular-nums">
                {formatNumber(sum.pedidos)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-subtle">Avaliações no Google</dt>
              <dd className="mt-0.5 font-display text-[24px] leading-none font-semibold tabular-nums">
                {formatNumber(sum.avaliacoes)}
                {sum.media !== null && (
                  <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
                    média {sum.media.toLocaleString("pt-BR")} de 5
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-subtle">Reclamações abertas</dt>
              <dd
                className={`mt-0.5 font-display text-[24px] leading-none font-semibold tabular-nums ${sum.reclamacoesAbertas > 0 ? "text-danger" : ""}`}
              >
                {formatNumber(sum.reclamacoesAbertas)}
              </dd>
            </div>
          </dl>
          {open.length > 0 && (
            <ul className="-mx-2 mt-3 border-t border-border pt-2">
              {open.map(({ id, e }) => (
                <li key={`${id}-${e.id}`}>
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: id }}
                    className="row-wash flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="truncate font-medium text-foreground">
                      {names.get(id) ?? "Cliente sem nome"}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                      reclamou em {formatDay(e.at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] leading-snug text-subtle">
        Registro manual, feito na ficha do cliente. A {BRAND.name} não lê o Google nem o Reclame
        Aqui sozinha.
      </p>
    </Card>
  );
}
