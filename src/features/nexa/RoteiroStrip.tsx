import { ChevronRight } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { nextStepId, progressOf, useRoteiro } from "@/features/setup/progress";

// Faixa de progresso da configuração, no topo da conversa com a Cris (o passo a passo fica fora da
// conversa, a conversa faz uma pergunta por vez). Conta os seis passos principais. Clicar abre o
// passo a passo.
export function RoteiroStrip({ accountId, onOpen }: { accountId: string; onOpen: () => void }) {
  const roteiro = useRoteiro(accountId, true);
  const r = roteiro.data;
  if (!r) return null;
  const { done, total } = progressOf(r);
  const next = nextStepId(r);
  const current = r.steps.find((s) => s.id === next) ?? null;
  const pending =
    done === total
      ? "Tudo pronto"
      : r.requiredPending === 0
        ? "O mínimo já está pronto"
        : r.requiredPending === 1
          ? "Falta 1 passo obrigatório"
          : `Faltam ${r.requiredPending} passos obrigatórios`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 border-b border-border px-4 py-2.5 text-left transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5"
      aria-label={`Configuração: ${done} de ${total}. ${current ? `Agora: ${current.title}.` : ""} ${pending}. Abrir o passo a passo`}
    >
      <span className="flex items-center gap-2 text-[12.5px]">
        <span className="font-medium tabular-nums">
          {done} de {total}
        </span>
        {current ? (
          <span className="truncate text-muted-foreground">
            · Agora: <span className="text-foreground">{current.title}</span>
          </span>
        ) : null}
        <span className="ml-auto hidden shrink-0 text-muted-foreground sm:inline">{pending}</span>
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
      <Progress
        value={total ? (done / total) * 100 : 100}
        className="h-1 bg-[var(--via-navy-06)]"
      />
    </button>
  );
}
