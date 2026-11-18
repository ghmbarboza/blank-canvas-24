import { ArrowRight, Bot, HeartPulse } from "lucide-react";

import { formatRelative } from "@/lib/format";

import { CustomerHealthBlock } from "../../customer-health";
import type { ContactRow } from "../../types";

type Props = { accountId: string; contact: ContactRow };

// Como está este cliente: saúde com o motivo (mesma conta da Saúde da carteira) e o que a IA leu
// nas conversas. A nota de lead e o histórico dela ficaram fora da ficha.
export function ContactAiPanel({ accountId, contact }: Props) {
  return (
    <section
      aria-labelledby="health-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2
        id="health-heading"
        className="mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-subtle uppercase"
      >
        <HeartPulse className="size-3.5 text-primary" aria-hidden /> Saúde do cliente
      </h2>
      <CustomerHealthBlock accountId={accountId} contactId={contact.id} maxFactors={5} />

      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-subtle uppercase">
            <Bot className="size-3.5 text-primary" aria-hidden /> Leitura da IA
          </h3>
          {contact.classified_at && (
            <span className="text-[11px] text-subtle">{formatRelative(contact.classified_at)}</span>
          )}
        </div>
        {contact.ai_intent && (
          <p className="text-[13px] font-medium text-foreground">{contact.ai_intent}</p>
        )}
        {contact.ai_summary && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {contact.ai_summary}
          </p>
        )}
        {contact.ai_next_step ? (
          <div className="mt-3 rounded-lg bg-primary p-3 text-primary-foreground shadow-primary">
            <p className="flex items-center gap-1 text-[11px] font-semibold tracking-widest uppercase opacity-80">
              Próximo passo <ArrowRight className="size-3" aria-hidden />
            </p>
            <p className="mt-1 text-[14px] leading-snug font-medium">{contact.ai_next_step}</p>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-[12px] text-muted-foreground">
            Quando houver conversa suficiente, a IA resume o cliente e sugere o próximo passo aqui.
          </p>
        )}
      </div>
    </section>
  );
}
