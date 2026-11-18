import { Link } from "@tanstack/react-router";

import { useContactLeadScore } from "./api";
import { BestHour, FactorList, PredictiveScore } from "./LeadScoreChip";

// Na ficha do contato: chance de fechar (aprendida com os ganhos e perdas) e o porquê.
export function LeadScoreCard({ accountId, contactId }: { accountId: string; contactId: string }) {
  const q = useContactLeadScore(accountId, contactId);
  const s = q.data;
  if (!s || (s.score === null && s.best_hour === null)) return null;
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-5"
      aria-label="Pontuação preditiva"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow">Chance de fechar</p>
        {s.score !== null && <PredictiveScore score={s.score} />}
      </div>
      <FactorList factors={s.factors} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <BestHour hour={s.best_hour} dow={s.best_dow} />
        <Link
          to="/sdr"
          className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Como a nota é feita
        </Link>
      </div>
    </section>
  );
}
