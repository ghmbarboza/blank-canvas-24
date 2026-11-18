import { ArrowRight, Bot } from "lucide-react";

import { formatRelative } from "@/lib/format";

import { useContactClassifications } from "../../api";
import type { ContactRow } from "../../types";
import { ScoreGauge } from "./ScoreGauge";
import { ScoreHistoryChart } from "./ScoreHistoryChart";

type Props = { accountId: string; contact: ContactRow };

export function ContactAiPanel({ accountId, contact }: Props) {
  const history = useContactClassifications(accountId, contact.id);
  const points = [...(history.data ?? [])]
    .reverse()
    .map((h) => ({ created_at: h.created_at, score: h.score }));

  return (
    <section
      aria-labelledby="ai-heading"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          id="ai-heading"
          className="flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-subtle uppercase"
        >
          <Bot className="size-3.5 text-primary" aria-hidden /> Leitura da IA
        </h2>
        {contact.classified_at && (
          <span className="text-[11px] text-subtle">{formatRelative(contact.classified_at)}</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <ScoreGauge score={contact.score} temperature={contact.temperature} />
        <dl className="min-w-0 flex-1 space-y-2">
          <div>
            <dt className="text-[11px] text-subtle">Intenção</dt>
            <dd className="text-[13px] font-medium">
              {contact.ai_intent ?? "Ainda não identificada"}
            </dd>
          </div>
        </dl>
      </div>

      {contact.ai_summary && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
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
          Quando houver conversa suficiente, a IA sugere o próximo passo aqui.
        </p>
      )}

      <div className="mt-4">
        <h3 className="mb-1 text-[11px] font-medium tracking-widest text-subtle uppercase">
          Histórico do score
        </h3>
        {history.isError ? (
          <p className="text-[12px] text-danger">Não deu para carregar o histórico.</p>
        ) : (
          <ScoreHistoryChart points={points} />
        )}
      </div>
    </section>
  );
}
