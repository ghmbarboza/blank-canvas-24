import { Compass, HelpCircle, ListChecks, ShieldAlert, Bot } from "lucide-react";

import { formatDateTime } from "@/lib/format";

interface Briefing {
  summary?: string;
  goal?: string;
  talking_points?: string[];
  questions?: string[];
  watch_out?: string[];
  generated_at?: string;
}

function List({ items }: { items: string[] | undefined }) {
  if (!items?.length) return <p className="text-[13px] text-subtle">Nada por aqui.</p>;
  return (
    <ul className="space-y-1.5 text-[13px] leading-relaxed">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

// Briefing da IA, gerado 30 min antes: quem é, objetivo, o que falar, o que perguntar e cuidados.
export function BriefingCard({ briefing }: { briefing: unknown }) {
  const b = (briefing ?? null) as Briefing | null;
  if (!b?.summary) return null;
  return (
    <section className="rounded-[24px] border border-border bg-surface p-5">
      <header className="flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-primary" />
        <h2 className="text-[15px] font-medium">Briefing para a reunião</h2>
        {b.generated_at && (
          <span className="ml-auto text-[12px] text-subtle">
            preparado em {formatDateTime(b.generated_at)}
          </span>
        )}
      </header>
      <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line">{b.summary}</p>
      {b.goal && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
          <Compass className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <strong className="font-semibold">Objetivo:</strong> {b.goal}
          </span>
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <ListChecks className="size-3.5" /> O que falar
          </p>
          <List items={b.talking_points} />
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <HelpCircle className="size-3.5" /> O que perguntar
          </p>
          <List items={b.questions} />
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <ShieldAlert className="size-3.5" /> Cuidados
          </p>
          <List items={b.watch_out} />
        </div>
      </div>
    </section>
  );
}
