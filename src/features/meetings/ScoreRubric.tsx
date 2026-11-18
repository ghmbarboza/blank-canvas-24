import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";

import { cn } from "@/lib/utils";

import { criterionWord } from "./lib";

export interface MeetingScoreData {
  total: number;
  criteria: { id: string; label: string; weight: number; score: number; evidence: string }[];
}

const DONE_AT = 7;

function verdict(total: number): string {
  if (total >= 80) return "Reunião muito bem conduzida.";
  if (total >= 60) return "Boa reunião, com pontos a ajustar.";
  return "Vale revisar com o gestor os critérios mais baixos.";
}

// Cartão da nota: o número grande e os dois critérios de maior peso, com a palavra que traduz a nota.
export function ScoreSummary({ score }: { score: MeetingScoreData }) {
  const pct = Math.max(0, Math.min(100, Math.round(score.total)));
  const top = [...score.criteria].sort((a, b) => b.weight - a.weight).slice(0, 2);
  return (
    <section
      aria-label="Nota da reunião"
      className="atmosphere flex h-full flex-col rounded-xl border border-border bg-surface p-5"
    >
      <p className="eyebrow">Nota da reunião</p>
      <p className="mt-2 font-display text-5xl leading-none font-semibold tabular-nums">
        {pct}
        <span className="ml-1 text-[18px] font-normal text-subtle">/100</span>
      </p>
      <p className="mt-2 text-[13px] text-muted-foreground">{verdict(pct)}</p>
      {top.length > 0 && (
        <ul className="mt-auto space-y-3 pt-5">
          {top.map((k) => (
            <li key={k.id}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate">{k.label}</span>
                <span className={cn("shrink-0 font-semibold", k.score < 4 && "text-danger")}>
                  {criterionWord(k.score)}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn("h-full rounded-full", k.score < 4 ? "bg-danger" : "bg-primary")}
                  style={{ width: `${Math.max(0, Math.min(10, k.score)) * 10}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Roteiro do playbook: cada critério da rubrica como um passo, cumprido a partir da nota 7, com o trecho que justifica.
export function ScoreRubric({
  score,
  playbook,
}: {
  score: MeetingScoreData;
  playbook?: string | null;
}) {
  const done = score.criteria.filter((k) => k.score >= DONE_AT).length;
  const total = score.criteria.length;
  return (
    <section
      aria-label="Roteiro do playbook"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-semibold">Roteiro do playbook</p>
        {playbook && (
          <span className="max-w-[55%] truncate rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {playbook}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between text-[12px] text-muted-foreground">
        <span>Aderência</span>
        <span className="tabular-nums">
          {done} de {total} cumpridos
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
        />
      </div>
      <ul className="mt-4 divide-y divide-border">
        {score.criteria.map((k) => {
          const ok = k.score >= DONE_AT;
          const weak = k.score < 4;
          const Icon = ok ? CheckCircle2 : weak ? CircleAlert : CircleDashed;
          return (
            <li key={k.id} className="flex gap-2.5 py-2.5">
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  ok ? "text-foreground" : weak ? "text-danger" : "text-subtle",
                )}
                aria-label={ok ? "cumprido" : weak ? "não cumprido" : "em parte"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className={cn(ok ? "text-muted-foreground" : "font-medium")}>
                    {k.label}
                  </span>
                  <span className="shrink-0 text-[12px] text-subtle tabular-nums">
                    {k.score}/10
                  </span>
                </div>
                {k.evidence && !ok && (
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                    {k.evidence}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
