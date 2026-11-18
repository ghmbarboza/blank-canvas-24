import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Bot, Loader2, Power, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { PLACEHOLDER_COMPANY } from "@/backend/setup-agent/roteiro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { agentsApi, type SimResult } from "@/features/agents/api";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  isEvaluating,
  useActivateAgent,
  useAgentStep,
  useCreateAgent,
  type AgentStepState,
} from "../api";
import type { RoteiroDetail } from "../progress";
import { StepDone, StepError, type StepProps } from "./ui";

type Line = { who: "cliente" | "atendente" | "erro"; text: string };

/** "Teste aqui": a pessoa faz de cliente e vê a resposta do atendente, sem celular. */
function TryBox({ accountId, agentId }: { accountId: string; agentId: string }) {
  const uid = useId();
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || busy) return;
    const next: Line[] = [...lines, { who: "cliente", text: msg }];
    setLines(next);
    setText("");
    setBusy(true);
    try {
      const r = await agentsApi<SimResult>(accountId, "agent.simulate", {
        agentId,
        history: next
          .filter((l) => l.who !== "erro")
          .map((l) => ({ role: l.who === "cliente" ? "user" : "assistant", content: l.text })),
      });
      const reply =
        r.reply ||
        (r.action === "handoff"
          ? "(o atendente passaria esta conversa para uma pessoa da equipe)"
          : "(sem resposta)");
      setLines((cur) => [...cur, { who: "atendente", text: reply }]);
    } catch (err) {
      setLines((cur) => [
        ...cur,
        { who: "erro", text: `Não consegui testar agora: ${errorMessage(err)}` },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => end.current?.scrollIntoView({ block: "nearest" }));
    }
  }

  return (
    <section
      aria-labelledby={`${uid}-t`}
      className="rounded-2xl border border-border bg-surface-2 p-4"
    >
      <h3 id={`${uid}-t`} className="flex items-center gap-2 text-[14px] font-semibold">
        <Sparkles className="size-4" aria-hidden /> Teste aqui
      </h3>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Escreva como se fosse um cliente. Ele responde com o que está na sua base. Nada sai para
        cliente de verdade.
      </p>
      {lines.length ? (
        <div
          className="mt-3 max-h-56 space-y-2 overflow-y-auto"
          role="log"
          aria-live="polite"
          aria-label="Conversa de teste"
        >
          {lines.map((l, i) => (
            <p
              key={i}
              className={cn(
                "max-w-[90%] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap",
                l.who === "cliente" && "ml-auto bg-primary text-primary-foreground",
                l.who === "atendente" && "border border-border bg-background",
                l.who === "erro" && "border border-hot-line bg-hot-soft text-hot-fg",
              )}
            >
              <span className="sr-only">{l.who === "cliente" ? "Você: " : "Atendente: "}</span>
              {l.text}
            </p>
          ))}
          {busy ? (
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Pensando…
            </p>
          ) : null}
          <div ref={end} />
        </div>
      ) : null}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <Label htmlFor={`${uid}-q`} className="sr-only">
          Pergunta de teste
        </Label>
        <Input
          id={`${uid}-q`}
          value={text}
          maxLength={500}
          placeholder="Ex.: Meu pedido chegou com defeito, o que eu faço?"
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={busy || !text.trim()} aria-label="Enviar pergunta de teste">
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          <span className="hidden sm:inline">Perguntar</span>
        </Button>
      </form>
    </section>
  );
}

function Activation({
  state,
  pending,
  onActivate,
  onGo,
}: {
  state: AgentStepState;
  pending: boolean;
  onActivate: () => void;
  onGo: (to: string) => void;
}) {
  const run = state.run;
  const evaluating = isEvaluating(state);
  const active = state.agent?.status === "active";
  if (active)
    return (
      <StepDone>
        {state.agent?.name} está ligado
        {state.whatsappOn
          ? " e responde no WhatsApp."
          : ". Conecte o WhatsApp para ele responder lá."}
      </StepDone>
    );
  const failed = run && run.status === "done" && (run.passRate ?? 0) < 0.9;
  return (
    <section className="space-y-3 rounded-2xl border border-border p-4" aria-live="polite">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold">
        <Power className="size-4" aria-hidden /> Ligar no WhatsApp
      </h3>
      {evaluating ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            O Vínculo está fazendo {run?.total ? `${run.total} perguntas` : "perguntas"} de teste ao
            atendente, como se fosse um cliente, e conferindo cada resposta
            {run?.total ? ` (${run.passed} certas até agora)` : ""}. Leva alguns minutos e você não
            precisa esperar aqui: siga para o próximo passo. Se ele acertar 9 em cada 10, liga
            sozinho.
          </p>
          <Progress
            value={run?.total ? Math.min(95, (run.passed / run.total) * 100 + 5) : 8}
            className="h-1.5"
            aria-label="Andamento da conferência"
          />
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          O atendente já funciona no teste aqui em cima. Para ele responder os clientes no
          WhatsApp, clique em ligar: o Vínculo faz perguntas de teste a ele e, se acertar 9 em cada
          10, liga sozinho em alguns minutos. Depois de ligado, ele responde toda mensagem que
          chegar no número conectado.
        </p>
      )}
      {failed ? (
        <StepError>
          Ele acertou {run.passed} de {run.total} e precisa de 90%. Coloque mais conteúdo na base de
          conhecimento (passo 3) e tente de novo, ou veja o que ele errou.
        </StepError>
      ) : null}
      {run?.status === "error" ? (
        <StepError>
          A conferência parou no meio{run.error ? ` (${run.error})` : ""}. Clique em ligar de novo.
        </StepError>
      ) : null}
      {!evaluating ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onActivate} disabled={pending} className="h-11">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Power aria-hidden />}
            {pending
              ? "Preparando as perguntas de teste…"
              : failed
                ? "Tentar ligar de novo"
                : "Ligar o atendente"}
          </Button>
          {failed ? (
            <Button variant="outline" className="h-11" onClick={() => onGo("/equipe-ia")}>
              Ver o que ele errou
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Passo 4: criar o atendente de pós-venda em um clique, testar na hora e ligar no WhatsApp. */
export function AgentStep({
  accountId,
  onNext,
  onGo,
  detail,
}: StepProps & { detail: RoteiroDetail | undefined }) {
  const uid = useId();
  const state = useAgentStep(accountId);
  const create = useCreateAgent(accountId);
  const activate = useActivateAgent(accountId);
  const company = detail?.company && detail.company !== PLACEHOLDER_COMPANY ? detail.company : "";
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName((cur) => cur || (company ? `Atendente da ${company}`.slice(0, 60) : "Atendente"));
    setGreeting(
      (cur) =>
        cur || `Oi! Aqui é ${company ? `da ${company}` : "do atendimento"}. Como posso te ajudar?`,
    );
  }, [company]);

  if (state.isLoading)
    return (
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Carregando" />
    );
  if (state.isError)
    return (
      <StepError>
        Não consegui carregar o atendente: {errorMessage(state.error)}. Feche e abra este passo de
        novo.
      </StepError>
    );

  const data = state.data!;
  const agent = data.agent;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      { name: name.trim(), greeting: greeting.trim() },
      {
        onSuccess: () => toast.success("Atendente criado. Teste aqui embaixo."),
        onError: (err) => setError(`Não consegui criar o atendente: ${errorMessage(err)}`),
      },
    );
  }

  if (!agent)
    return (
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13px]">
          Ele já vem pronto para o pós-venda: tira dúvidas de quem comprou, pergunta a satisfação e
          chama uma pessoa da equipe quando o cliente está insatisfeito. A IA já está inclusa, não
          precisa de chave.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-n`}>Nome do atendente</Label>
          <Input
            id={`${uid}-n`}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-g`}>Saudação (primeira mensagem)</Label>
          <Textarea
            id={`${uid}-g`}
            value={greeting}
            rows={2}
            maxLength={300}
            onChange={(e) => setGreeting(e.target.value)}
          />
        </div>
        {(detail?.documents ?? 0) === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Dica: com a base de conhecimento vazia ele responde pouco. Vale passar pelo passo 3
            antes de ligar.
          </p>
        ) : null}
        {error ? <StepError>{error}</StepError> : null}
        <Button type="submit" className="h-11" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Bot aria-hidden />
          )}
          Criar meu atendente
        </Button>
      </form>
    );

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-[14px]">
        <Bot className="size-4" aria-hidden />
        <span className="font-semibold">{agent.name}</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted-foreground">
          {agent.status === "active"
            ? "ligado"
            : agent.status === "paused"
              ? "pausado"
              : "criado, ainda desligado"}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onGo("/equipe-ia")}>
          Ajustar na Equipe de IA
        </Button>
      </p>
      {agent.status === "paused" && agent.reason ? <StepError>{agent.reason}</StepError> : null}
      <TryBox accountId={accountId} agentId={agent.id} />
      <Activation
        state={data}
        pending={activate.isPending}
        onGo={onGo}
        onActivate={() =>
          activate.mutate(
            {},
            {
              onError: (err) =>
                toast.error(`Não consegui começar a conferência: ${errorMessage(err)}`),
            },
          )
        }
      />
      <Button variant="outline" className="h-11" onClick={onNext}>
        Continuar
        <ArrowRight aria-hidden />
      </Button>
    </div>
  );
}
