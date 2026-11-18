import { Loader2, RefreshCw, Bot } from "lucide-react";

import { TempChip } from "@/components/common/TempChip";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { useClassifyContact } from "../api";
import { HealthRing } from "./HealthRing";
import type { Contact } from "../types";

export function IntelligenceBlock({ accountId, contact }: { accountId: string; contact: Contact }) {
  const classify = useClassifyContact(accountId, contact.id);
  const classified = contact.score !== null;

  const action = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => classify.mutate()}
      disabled={classify.isPending}
      aria-label={classified ? "Reclassificar com IA" : "Classificar com IA"}
    >
      {classify.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {classified ? "Reclassificar" : "Classificar"}
    </Button>
  );

  if (!classified) {
    return (
      <div className="rounded-xl border border-dashed border-border-strong p-4 text-center">
        <Bot className="mx-auto size-5 text-primary" aria-hidden />
        <p className="mt-2 text-[13px] text-muted-foreground">
          A IA ainda não leu esta conversa. Classifique para ver score, intenção e próximo passo.
        </p>
        <div className="mt-3">{action}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <HealthRing score={contact.score ?? 0} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-foreground">Chance de fechar</p>
            <TempChip level={contact.temperature} />
          </div>
          {contact.ai_intent ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              {contact.ai_intent}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-muted-foreground">Nota de 0 a 100 dada pela IA</p>
          )}
        </div>
      </div>
      {contact.ai_summary && (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed text-muted-foreground">
          {contact.ai_summary}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-subtle">
          {contact.classified_at ? `Classificado ${formatRelative(contact.classified_at)}` : ""}
        </p>
        {action}
      </div>
    </div>
  );
}
