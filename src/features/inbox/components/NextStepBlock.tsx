import { useState } from "react";
import { ArrowRight, CalendarPlus, Plus, Bot } from "lucide-react";

import { useContactDeals } from "../api";
import type { Contact } from "../types";
import { CreateDealDialog } from "./CreateDealDialog";
import { ScheduleDialog } from "./ScheduleDialog";

// Sugestão de ação: o próximo passo que a IA leu na conversa e o atalho que o cumpre.
export function NextStepBlock({ accountId, contact }: { accountId: string; contact: Contact }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const deals = useContactDeals(accountId, contact.id);
  const hasOpenDeal = (deals.data?.length ?? 0) > 0;
  const name = contact.name || "contato";

  return (
    <section
      aria-labelledby="next-step-title"
      className="relative overflow-hidden rounded-r-xl rounded-l-sm border border-border bg-surface py-4 pr-4 pl-5"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
      <h3
        id="next-step-title"
        className="flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-subtle uppercase"
      >
        <Bot className="size-3.5 text-foreground" aria-hidden />
        Sugestão de ação
      </h3>
      <p className="mt-2 text-[14px] leading-snug font-medium text-foreground">
        {contact.ai_next_step ||
          "Combine o próximo contato: agende uma conversa ou abra um negócio."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setScheduleOpen(true)}
          className="group inline-flex items-center gap-1 rounded text-[13px] font-semibold text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <CalendarPlus className="size-3.5" aria-hidden /> Agendar
          <ArrowRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>
        {deals.isSuccess && !hasOpenDeal && (
          <button
            type="button"
            onClick={() => setDealOpen(true)}
            className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Plus className="size-3.5" aria-hidden /> Criar negócio
          </button>
        )}
      </div>
      {scheduleOpen && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          accountId={accountId}
          contactId={contact.id}
          contactName={name}
        />
      )}
      {dealOpen && (
        <CreateDealDialog
          open={dealOpen}
          onOpenChange={setDealOpen}
          accountId={accountId}
          contactId={contact.id}
          contactName={name}
        />
      )}
    </section>
  );
}
