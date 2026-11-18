// Primeiros passos: o passo a passo do primeiro acesso, pensado para a aula ao vivo. À esquerda,
// os seis passos com o estado de cada um e a barra de progresso; à direita, o formulário do passo
// escolhido. Tudo se faz por botão; a Vi fica a um clique para tirar dúvida. O estado vem do
// roteiro do servidor (o que está feito é lido da conta, não do que a pessoa clicou).
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, MessageCircle, PartyPopper, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

import {
  laterSteps,
  mainSteps,
  nextStepId,
  progressOf,
  stepStatus,
  useRoteiro,
  type RoteiroStepView,
  type RoteiroView,
  type StepStatus,
} from "./progress";
import { AgentStep } from "./steps/AgentStep";
import { CompanyStep } from "./steps/CompanyStep";
import { KnowledgeStep } from "./steps/KnowledgeStep";
import { RulesStep } from "./steps/RulesStep";
import { TestStep } from "./steps/TestStep";
import type { StepProps } from "./steps/ui";
import { WhatsAppStep } from "./steps/WhatsAppStep";

const STATUS_LABEL: Record<StepStatus, string> = {
  feito: "Feito",
  agora: "Agora",
  depois: "Depois",
};

const CTA: Record<string, string> = {
  empresa: "Preencher",
  canal: "Conectar",
  conhecimento: "Subir conteúdo",
  agente: "Criar e testar",
  regras: "Escolher regras",
  teste: "Testar",
};

function StepRow({
  step,
  index,
  status,
  selected,
  onSelect,
}: {
  step: RoteiroStepView;
  index: number;
  status: StepStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "step" : undefined}
        className={cn(
          "group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          selected
            ? "border-foreground/70 bg-surface"
            : status === "agora"
              ? "border-primary-line bg-primary-soft hover:bg-surface"
              : "border-transparent hover:border-border hover:bg-surface",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
            status === "feito" && "bg-primary text-primary-foreground",
            status === "agora" && "border-2 border-primary text-foreground",
            status === "depois" && "border border-foreground/25 text-muted-foreground",
          )}
        >
          {status === "feito" ? <Check className="size-3.5" /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[14px] font-semibold">{step.title}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-px text-[11px] font-medium",
                status === "agora" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {STATUS_LABEL[status]}
              {step.required && status !== "feito" ? " · obrigatório" : ""}
            </span>
          </span>
          {step.summary ? (
            <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
              {step.summary}
            </span>
          ) : null}
          {status === "agora" ? (
            <span
              className={cn(
                "mt-2 inline-flex items-center gap-1 text-[13px] font-semibold",
                selected && "md:hidden",
              )}
            >
              {CTA[step.id] ?? "Abrir"} <ArrowRight className="size-3.5" aria-hidden />
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function AllDone({ onGo }: { onGo: (to: string) => void }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-primary-soft">
        <PartyPopper className="size-8" aria-hidden />
      </span>
      <h2 id="setup-guide-step" className="mt-4 text-[20px] font-semibold tracking-tight">
        Tudo pronto
      </h2>
      <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">
        O pós-venda da sua empresa está funcionando no WhatsApp. Acompanhe as conversas na Caixa de
        entrada e ajuste as regras quando quiser.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button className="h-11" onClick={() => onGo("/inbox")}>
          Abrir a Caixa de entrada
        </Button>
        <Button variant="outline" className="h-11" onClick={() => onGo("/pos-venda")}>
          Ver o pós-venda
        </Button>
      </div>
    </div>
  );
}

function panelFor(id: string, props: StepProps, r: RoteiroView): ReactNode {
  const done = r.steps.find((s) => s.id === id)?.done ?? false;
  if (id === "empresa") return <CompanyStep {...props} detail={r.detail} />;
  if (id === "canal") return <WhatsAppStep {...props} done={done} />;
  if (id === "conhecimento") return <KnowledgeStep {...props} done={done} />;
  if (id === "agente") return <AgentStep {...props} detail={r.detail} />;
  if (id === "regras") return <RulesStep {...props} rulesOn={r.detail?.rulesOn ?? 0} />;
  if (id === "teste") return <TestStep {...props} detail={r.detail} />;
  return null;
}

interface Props {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** passo aberto no painel; null = a lista (no celular) ou o próximo passo (na tela larga) */
  step: string | null;
  onStep: (id: string | null) => void;
  /** troca o passo a passo pela conversa com a Vi */
  onAskVi: () => void;
}

export function SetupGuide({ accountId, open, onOpenChange, step, onStep, onAskVi }: Props) {
  const navigate = useNavigate();
  const roteiro = useRoteiro(accountId, true, open);
  const r = roteiro.data;

  function go(to: string) {
    onOpenChange(false);
    void navigate({ to });
  }

  const main = r ? mainSteps(r) : [];
  const later = r ? laterSteps(r) : [];
  const next = r ? nextStepId(r) : null;
  const known = step && main.some((s) => s.id === step) ? step : null;
  const active = known ?? next;
  const activeStep = main.find((s) => s.id === active) ?? null;
  const progress = r ? progressOf(r) : { done: 0, total: 6, pct: 0 };

  function goNext() {
    const i = main.findIndex((s) => s.id === active);
    const after =
      main.slice(i + 1).find((s) => !s.done) ?? main.find((s) => !s.done && s.id !== active);
    onStep(after?.id ?? null);
  }

  const stepProps: StepProps = { accountId, onNext: goNext, onGo: go };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(214_70%_9%/0.6)] backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby="setup-guide-desc"
          className={cn(
            "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none",
            "md:inset-auto md:top-1/2 md:left-1/2 md:h-[min(820px,calc(100dvh-32px))] md:w-[min(1040px,calc(100vw-32px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:shadow-[0_40px_120px_-20px_rgb(0_0_0/0.45)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        >
          <header className="border-b border-border px-4 py-3 md:px-6 md:py-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight md:text-[19px]">
                  Primeiros passos no {BRAND.name}
                </DialogPrimitive.Title>
                <p id="setup-guide-desc" className="text-[12.5px] text-muted-foreground">
                  {progress.done === progress.total
                    ? "Tudo pronto. Você pode voltar aqui quando quiser."
                    : `${progress.done} de ${progress.total} passos prontos. Faça na ordem, um botão por vez.`}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onAskVi} className="shrink-0">
                <MessageCircle aria-hidden />
                <span className="hidden sm:inline">Perguntar para a {BRAND.assistant}</span>
                <span className="sm:hidden">{BRAND.assistant}</span>
              </Button>
              <DialogPrimitive.Close
                aria-label="Fechar os primeiros passos"
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <Progress
              value={progress.pct}
              className="mt-3 h-1.5"
              aria-label={`Progresso: ${progress.done} de ${progress.total} passos`}
            />
          </header>

          {!r ? (
            <div className="grid flex-1 place-items-center p-8 text-[14px] text-muted-foreground">
              {roteiro.isError ? (
                <div className="text-center">
                  <p>Não consegui carregar os passos. Confira a internet e tente de novo.</p>
                  <Button className="mt-3" onClick={() => void roteiro.refetch()}>
                    Tentar de novo
                  </Button>
                </div>
              ) : (
                <div className="grid w-full max-w-md gap-3" aria-busy>
                  <div className="h-14 animate-pulse rounded-2xl bg-surface-2" />
                  <div className="h-14 animate-pulse rounded-2xl bg-surface-2" />
                  <div className="h-14 animate-pulse rounded-2xl bg-surface-2" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <nav
                aria-label="Passos da configuração"
                className={cn(
                  "min-h-0 w-full flex-col overflow-y-auto bg-surface-2/60 p-3 md:flex md:w-[340px] md:shrink-0 md:border-r md:border-border md:p-4",
                  known ? "hidden" : "flex",
                )}
              >
                <ol className="grid gap-1.5">
                  {main.map((s, i) => (
                    <StepRow
                      key={s.id}
                      step={s}
                      index={i}
                      status={stepStatus(r, s.id)}
                      selected={s.id === active}
                      onSelect={() => onStep(s.id)}
                    />
                  ))}
                </ol>
                {later.length ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="px-1 text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">
                      Depois, se quiser
                    </p>
                    <ul className="mt-2 grid gap-1">
                      {later.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{s.title}</span>
                            {s.done ? (
                              <span className="ml-1.5 text-muted-foreground">(feito)</span>
                            ) : null}
                          </span>
                          {!s.done ? (
                            <Button variant="ghost" size="sm" onClick={onAskVi}>
                              Fazer com a {BRAND.assistant}
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </nav>

              <section
                aria-labelledby="setup-guide-step"
                className={cn(
                  "min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:flex",
                  known ? "flex" : "hidden",
                )}
              >
                <div className="mx-auto w-full max-w-[640px] px-4 py-5 md:px-8 md:py-7">
                  <button
                    type="button"
                    onClick={() => onStep(null)}
                    className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden"
                  >
                    <ArrowLeft className="size-4" aria-hidden /> Todos os passos
                  </button>
                  {activeStep ? (
                    <>
                      <p className="text-[12px] font-medium text-muted-foreground">
                        Passo {main.findIndex((s) => s.id === activeStep.id) + 1} de {main.length}
                        {activeStep.done ? " · feito" : ""}
                      </p>
                      <h2
                        id="setup-guide-step"
                        className="mt-0.5 text-[22px] font-semibold tracking-tight"
                      >
                        {activeStep.title}
                      </h2>
                      {activeStep.summary ? (
                        <p className="mt-1 mb-5 text-[14px] text-muted-foreground">
                          {activeStep.summary}
                        </p>
                      ) : null}
                      <div key={activeStep.id}>{panelFor(activeStep.id, stepProps, r)}</div>
                    </>
                  ) : (
                    <AllDone onGo={go} />
                  )}
                </div>
              </section>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
