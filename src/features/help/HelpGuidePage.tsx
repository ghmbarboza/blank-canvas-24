import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

import type { HelpGuide } from "./content";

export function HelpGuidePage({ guide }: { guide: HelpGuide | undefined }) {
  if (!guide)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader title="Guia não encontrado" />
        <div className="p-6">
          <Button asChild variant="outline">
            <Link to="/central-de-ajuda">
              <ArrowLeft /> Voltar para a ajuda
            </Link>
          </Button>
        </div>
      </div>
    );

  const link = guide.link;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={guide.titulo} description={guide.resumo} />
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <Link
            to="/central-de-ajuda"
            className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden /> Todos os guias
          </Link>
          <ol className="flex flex-col gap-3">
            {guide.passos.map((p, i) => (
              <li key={p} className="flex gap-3 rounded-[18px] border border-border bg-surface p-4">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="min-w-0 pt-0.5 text-[14px] leading-relaxed text-foreground">
                  <span className="sr-only">Passo {i + 1}: </span>
                  {p}
                </p>
              </li>
            ))}
          </ol>
          {link ? (
            <Button asChild className="w-full sm:w-fit">
              <Link to={link.to} search={link.aba ? { aba: link.aba } : {}}>
                {link.label} <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
