import { ArrowRight, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { RoteiroDetail } from "../progress";
import { CheckLine, StepError, type StepProps } from "./ui";

/** Passo 6: mandar uma mensagem do próprio celular e ver chegar; confere sozinho a cada 5 s. */
export function TestStep({ onGo, detail }: StepProps & { detail: RoteiroDetail | undefined }) {
  const connected = Boolean(detail?.whatsapp);
  const received = Boolean(detail?.received);
  const replied = Boolean(detail?.replied);
  const done = received && replied;

  return (
    <div className="space-y-5">
      {!connected ? (
        <StepError>
          Conecte o WhatsApp primeiro (passo 2). Sem o número conectado a mensagem não chega aqui.
        </StepError>
      ) : null}

      <ol className="space-y-3 text-[14px]">
        <li className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
            1
          </span>
          <span>
            De <strong>outro número</strong> (o seu celular pessoal ou o de um colega), mande um
            &quot;Oi&quot; para o WhatsApp que você conectou no passo 2
            {detail?.whatsapp && /\d{6,}/.test(detail.whatsapp) ? ` (${detail.whatsapp})` : ""}.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
            2
          </span>
          <span>
            Abra a Caixa de entrada: a conversa aparece em alguns segundos. Se o atendente de IA
            estiver ligado, ele responde sozinho; se não, responda você por lá.
          </span>
        </li>
      </ol>

      <div className="rounded-2xl border border-border bg-surface-2 p-4" aria-live="polite">
        <p className="text-[12px] font-medium tracking-wide text-subtle uppercase">
          Conferindo sozinho
        </p>
        <ul className="mt-2 space-y-2">
          <CheckLine ok={received}>Mensagem recebida na central</CheckLine>
          <CheckLine ok={replied}>Resposta enviada para o cliente</CheckLine>
        </ul>
        {done ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold">
            <PartyPopper className="size-4" aria-hidden /> Funcionou! O pós-venda está no ar.
          </p>
        ) : received ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            A mensagem chegou. Falta a resposta: responda pela Caixa de entrada ou ligue o atendente
            no passo 4.
          </p>
        ) : connected ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Nada chegou ainda. A mensagem precisa sair de um número diferente do que está
            conectado: mandar do próprio número conectado não aparece aqui. Confira também se o
            celular conectado está com internet.
          </p>
        ) : null}
      </div>

      <Button className="h-11" onClick={() => onGo("/inbox")}>
        Abrir a Caixa de entrada
        <ArrowRight aria-hidden />
      </Button>
    </div>
  );
}
