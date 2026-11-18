// A conversa com a Nexa: a pessoa em balão à direita, a Nexa em texto corrido à esquerda,
// e o que ela desenha (opções, formulário, cartões, etapas, ações) dentro da própria resposta.
// Só a última resposta aceita clique; nas antigas fica marcado o que a pessoa escolheu.
import { Check, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

import { redact } from "@/backend/setup-agent/redact";

import type { StageBlock } from "@/backend/setup-agent/stage";
import { Markdown } from "@/features/support/MarkdownView";
import { cn } from "@/lib/utils";

import { ActionList, StageBlockView } from "./Blocks";
import { pickedFrom } from "./picked-from";
import type { NexaTurn } from "./useNexa";

export function NexaFace({ className }: { className?: string }) {
  return (
    <img
      src="/nexa/guia.png"
      alt=""
      width={340}
      height={400}
      className={cn(
        "shrink-0 rounded-full bg-[hsl(var(--nexa-wash))] object-cover object-[50%_18%] ring-1 ring-[hsl(var(--nexa-accent)/0.25)]",
        className,
      )}
    />
  );
}

type Props = {
  accountId: string;
  turns: NexaTurn[];
  working: string | null;
  error: string | null;
  isBusy: boolean;
  onAnswer: (text: string) => void;
  onOpen: (to: string) => void;
  onRetry: () => void;
};

function OldBlock({
  block,
  reply,
  accountId,
}: {
  block: StageBlock;
  reply: string | undefined;
  accountId: string;
}) {
  // formulário já respondido vira uma linha: o que foi enviado está no balão da pessoa
  if (block.kind === "form" && reply)
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Check className="size-3.5" /> {block.title}: enviado
      </p>
    );
  return (
    <StageBlockView
      block={block}
      compact
      active={false}
      live={false}
      accountId={accountId}
      picked={pickedFrom(reply)}
      onAnswer={() => {}}
    />
  );
}

function Assistant({
  accountId,
  turn,
  reply,
  isLast,
  isBusy,
  onAnswer,
  onOpen,
}: {
  accountId: string;
  turn: NexaTurn;
  reply: string | undefined;
  isLast: boolean;
  isBusy: boolean;
  onAnswer: (text: string) => void;
  onOpen: (to: string) => void;
}) {
  const hasExtras = turn.blocks.length > 0 || turn.actions.length > 0;
  return (
    <div className="flex gap-3">
      <NexaFace className="mt-0.5 size-8" />
      <div className="min-w-0 flex-1">
        {turn.text ? (
          <div className="text-[15px] leading-relaxed [&_strong]:font-semibold">
            <Markdown source={turn.text} />
          </div>
        ) : null}
        {hasExtras ? (
          <div className="mt-4 grid gap-5">
            {turn.blocks.map((b, i) =>
              isLast ? (
                <StageBlockView
                  key={`${turn.id}-${i}`}
                  block={b}
                  compact
                  active={!isBusy}
                  accountId={accountId}
                  onAnswer={onAnswer}
                />
              ) : (
                <OldBlock key={`${turn.id}-${i}`} block={b} reply={reply} accountId={accountId} />
              ),
            )}
            <ActionList actions={turn.actions} onOpen={onOpen} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Thread({
  accountId,
  turns,
  working,
  error,
  isBusy,
  onAnswer,
  onOpen,
  onRetry,
}: Props) {
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const last = turns.at(-1);
  // Rolagem: enquanto a Nexa escreve, acompanha o fim. Quando ela termina, mostra o COMEÇO da
  // primeira mensagem nova dela (depois da última fala da pessoa), para a leitura começar do
  // início e não cortar o cumprimento (abertura em duas mensagens, design system SUBIDO).
  const lastUser = turns.map((t) => t.role).lastIndexOf("user");
  const firstNew = turns[lastUser + 1];
  useEffect(() => {
    if (!working && !error && last?.role !== "user" && firstNew) {
      const el = box.current?.querySelector<HTMLElement>(`[data-turn="${firstNew.id}"]`);
      if (el) {
        // Mensagem que traz formulário (endereço do servidor, chave): o botão de enviar ficava
        // escondido atrás da caixa de conversa e a pessoa não achava onde clicar. Com formulário,
        // quem fica no meio da tela é ele; sem formulário, a leitura começa do início da fala.
        const form = el.querySelector<HTMLElement>("form");
        if (form) form.scrollIntoView({ block: "center", behavior: "smooth" });
        else el.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
    }
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, last?.text, last?.blocks.length, working, error, firstNew, last?.role]);

  return (
    <div ref={box} className="grid gap-7" aria-live="polite">
      {turns.map((t, i) => {
        if (t.role === "user")
          return (
            <div
              key={t.id}
              className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-[22px] bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed"
            >
              {redact(t.text).text}
            </div>
          );
        const next = turns[i + 1];
        return (
          <div key={t.id} data-turn={t.id} className="scroll-mt-4">
            <Assistant
              accountId={accountId}
              turn={t}
              reply={next?.role === "user" ? next.text : undefined}
              isLast={t.id === last?.id}
              isBusy={isBusy}
              onAnswer={onAnswer}
              onOpen={onOpen}
            />
          </div>
        );
      })}
      {working && (last?.role === "user" || !last?.text) ? (
        <div className="flex items-center gap-3 text-[14px] text-muted-foreground">
          <NexaFace className="size-8" />
          <span className="flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" /> {working}…
          </span>
        </div>
      ) : null}
      {error && !isBusy ? (
        <div className="flex items-center gap-3 text-[14px]">
          <span className="text-destructive">{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[13px] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="size-3.5" /> Tentar de novo
          </button>
        </div>
      ) : null}
      <div ref={end} />
    </div>
  );
}
