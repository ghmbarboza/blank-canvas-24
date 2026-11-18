import { Bot, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomerHealthBlock } from "@/features/contacts/customer-health";
import { MomentBlock } from "@/features/posvenda/moment-ui";
import { formatRelative } from "@/lib/format";
import { useClassifyContact } from "../api";
import type { Contact } from "../types";

// Saúde do cliente (mesma conta da tela Saúde da carteira) e o resumo que a IA faz da conversa.
// A nota de 0 a 100 e a temperatura de lead ficaram fora da tela: em pós-venda quem responde
// "como está este cliente?" é a saúde, com o motivo.
export function IntelligenceBlock({ accountId, contact }: { accountId: string; contact: Contact }) {
  const classify = useClassifyContact(accountId, contact.id);
  const read = Boolean(contact.ai_summary);

  return (
    <div>
      <CustomerHealthBlock accountId={accountId} contactId={contact.id} />
      <MomentBlock
        accountId={accountId}
        contactId={contact.id}
        className="mt-4 border-t border-border pt-3"
      />
      <div className="mt-4 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-subtle uppercase">
          <Bot className="size-3.5 text-foreground" aria-hidden /> Resumo da IA
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {contact.ai_summary ||
            "A IA ainda não leu esta conversa. Peça o resumo para ver o que o cliente quer e o próximo passo."}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-subtle">
            {read && contact.classified_at
              ? `Atualizado ${formatRelative(contact.classified_at)}`
              : ""}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => classify.mutate()}
            disabled={classify.isPending}
            aria-label={read ? "Atualizar resumo com IA" : "Resumir com IA"}
          >
            {classify.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {read ? "Atualizar resumo" : "Resumir com IA"}
          </Button>
        </div>
      </div>
    </div>
  );
}
