import { ArrowRight, HeartHandshake } from "lucide-react";

import { Button } from "@/components/ui/button";

import { StepDone, type StepProps } from "./ui";

const EXAMPLES = [
  "Boas-vindas depois da compra",
  "Como está indo? depois de 7 dias",
  "Pesquisa de satisfação",
  "Nota baixa vira chamado para a equipe",
  "Nota alta pede indicação",
  "Lembrete de recompra",
  "Cliente parado volta para a conversa",
];

/** Passo 5: as regras são ligadas na tela Pós-venda; aqui fica a porta e o estado. */
export function RulesStep({ onGo, onNext, rulesOn }: StepProps & { rulesOn: number }) {
  return (
    <div className="space-y-5">
      {rulesOn > 0 ? (
        <StepDone>
          {rulesOn === 1 ? "1 regra ligada." : `${rulesOn} regras ligadas.`} Você pode ligar ou
          desligar outras quando quiser.
        </StepDone>
      ) : null}
      <div className="rounded-2xl border border-border bg-surface-2 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <HeartHandshake className="size-4" aria-hidden /> O que a central pode fazer sozinha
        </p>
        <ul className="mt-3 grid gap-1.5 text-[13px] text-muted-foreground sm:grid-cols-2">
          {EXAMPLES.map((e) => (
            <li key={e} className="flex gap-2">
              <span aria-hidden>·</span>
              {e}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px]">
          Ligue pelo menos uma. Cada regra tem um botão de liga e desliga, e nada sai sem o WhatsApp
          conectado.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" onClick={() => onGo("/pos-venda")}>
          {rulesOn > 0 ? "Ver as regras de pós-venda" : "Escolher as regras de pós-venda"}
          <ArrowRight aria-hidden />
        </Button>
        {rulesOn > 0 ? (
          <Button variant="outline" className="h-11" onClick={onNext}>
            Continuar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
