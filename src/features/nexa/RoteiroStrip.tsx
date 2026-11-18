import { ChevronRight } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { useRoteiro } from "@/features/setup/progress";

// Faixa de progresso da configuração, no topo da Nexa (design system SUBIDO: o passo a passo fica
// fora da conversa, a conversa faz uma pergunta por vez). O progresso começa acima de zero: a
// conta criada já conta como passo. Clicar abre o painel com tudo o que a Nexa sabe.
export function RoteiroStrip({ accountId, onOpen }: { accountId: string; onOpen: () => void }) {
  const roteiro = useRoteiro(accountId, true);
  const r = roteiro.data;
  if (!r) return null;
  const total = r.steps.length + 1;
  const done = r.steps.filter((s) => s.done).length + 1;
  const index = r.steps.findIndex((s) => s.id === r.current);
  const current = index >= 0 ? r.steps[index] : null;
  const pending =
    r.requiredPending === 0
      ? "O mínimo já está pronto"
      : r.requiredPending === 1
        ? "Falta 1 passo obrigatório"
        : `Faltam ${r.requiredPending} passos obrigatórios`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 border-b border-border px-4 py-2.5 text-left transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:px-5"
      aria-label={`Configuração: ${done} de ${total}. ${current ? `Agora: ${current.title}.` : ""} ${pending}. Ver o roteiro completo`}
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
      <Progress value={(done / total) * 100} className="h-1 bg-[var(--via-navy-06)]" />
    </button>
  );
}
