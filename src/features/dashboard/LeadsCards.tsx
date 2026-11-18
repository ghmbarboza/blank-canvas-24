import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSpan } from "@/features/agenda/calendar";
import { formatNumber } from "@/lib/format";

import { useHotLeads, useTodayEvents } from "./api";
import { DEMO_EVENTS, DEMO_HOT_LEADS } from "./demo";
import type { Gerencial } from "./gerencial";
import { Card, EmptyNote, ScoreRing } from "./ui";

// Temperatura da base: rampa navy (quente = navy cheio), sempre com o rótulo.
export function TemperatureCard({ data, className }: { data: Gerencial; className?: string }) {
  const t = data.temperature;
  const classified = t.hot + t.warm + t.cold;
  const parts = [
    { key: "hot", label: "Quentes", n: t.hot, bg: "bg-hot", fg: "text-white dark:text-[#001F35]" },
    {
      key: "warm",
      label: "Mornos",
      n: t.warm,
      bg: "bg-warm",
      fg: "text-white dark:text-[#001F35]",
    },
    { key: "cold", label: "Frios", n: t.cold, bg: "bg-cold-line", fg: "text-foreground" },
  ];
  return (
    <Card
      id="painel-temperatura"
      eyebrow="Temperatura dos leads"
      title={
        classified
          ? `${Math.round((100 * t.hot) / classified)}% da base está pronta para comprar`
          : "Classificação da IA"
      }
      link={{ to: "/contatos", label: "Ver contatos" }}
      className={className}
    >
      {classified === 0 ? (
        <EmptyNote>A IA classifica cada lead que escreve. Ainda não há classificados.</EmptyNote>
      ) : (
        <>
          <div
            className="flex h-12 overflow-hidden rounded-xl"
            role="img"
            aria-label={parts.map((p) => `${p.label}: ${p.n}`).join(", ")}
          >
            {parts.map((p) =>
              p.n > 0 ? (
                <div
                  key={p.key}
                  className={`${p.bg} ${p.fg} grid place-items-center text-[12px] font-semibold tabular-nums transition-[flex-grow] duration-700`}
                  style={{ flexGrow: p.n, flexBasis: 0 }}
                >
                  {Math.round((100 * p.n) / classified)}%
                </div>
              ) : null,
            )}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {parts.map((p) => (
              <div key={p.key}>
                <dt className="text-[12px] text-muted-foreground">{p.label}</dt>
                <dd className="font-display text-[22px] font-semibold tabular-nums">
                  {formatNumber(p.n)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
            <ScoreRing score={data.kpis.avg_score} size={40} />
            <p className="text-[12px] leading-snug text-muted-foreground">
              Nota média da base.{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatNumber(data.kpis.classified)}
              </span>{" "}
              classificações da IA no período
              {t.unclassified ? `, ${formatNumber(t.unclassified)} ainda sem nota` : ""}.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}

export function HotLeadsCard({ demo, className }: { demo: boolean; className?: string }) {
  const { data, isLoading } = useHotLeads(5);
  const leads = demo
    ? DEMO_HOT_LEADS.map((l) => ({
        id: l.id,
        name: l.name,
        company: l.company,
        avatar_url: null,
        source: l.source,
        score: l.score,
        ai_next_step: l.next,
      }))
    : (data ?? []);
  return (
    <Card
      id="painel-quentes"
      eyebrow="Leads quentes agora"
      title="Quem a IA recomenda atender primeiro"
      link={{ to: "/contatos", label: "Todos os contatos" }}
      className={className}
    >
      {!demo && isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <EmptyNote>Nenhum lead quente agora.</EmptyNote>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {leads.map((l) => {
            const body = (
              <>
                <ContactAvatar name={l.name} src={l.avatar_url} platform={l.source} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    {l.name ?? "Sem nome"}
                  </span>
                  {l.company && (
                    <span className="block truncate text-[12px] text-subtle">{l.company}</span>
                  )}
                  {l.ai_next_step && (
                    <span className="mt-1 flex items-start gap-1.5 text-[12px] text-muted-foreground">
                      <Bot className="mt-0.5 size-3 shrink-0 text-foreground" aria-hidden />
                      <span className="line-clamp-1">{l.ai_next_step}</span>
                    </span>
                  )}
                </span>
                <ScoreRing score={l.score} />
              </>
            );
            return (
              <li key={l.id}>
                {demo ? (
                  <div className="row-wash flex items-center gap-3 rounded-xl px-2 py-2">
                    {body}
                  </div>
                ) : (
                  <Link
                    to="/contatos/$contactId"
                    params={{ contactId: l.id }}
                    className="row-wash flex items-center gap-3 rounded-xl px-2 py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function AgendaCard({ demo, className }: { demo: boolean; className?: string }) {
  const { data, isLoading } = useTodayEvents();
  const events = demo
    ? DEMO_EVENTS.map((e) => ({
        id: e.id,
        when: e.time,
        extra: e.duration,
        title: e.title,
        who: e.who,
      }))
    : (data ?? []).map((ev) => ({
        id: ev.row.id,
        when: formatSpan(ev),
        extra: "",
        title: ev.row.title,
        who: ev.contact?.name ?? "",
      }));
  return (
    <Card
      id="painel-agenda"
      eyebrow="Hoje na agenda"
      title={
        events.length
          ? `${events.length} ${events.length === 1 ? "compromisso" : "compromissos"} hoje`
          : "Agenda de hoje"
      }
      link={{ to: "/agenda", label: "Abrir agenda" }}
      className={className}
    >
      {!demo && isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : events.length === 0 ? (
        <EmptyNote>Nada marcado para hoje.</EmptyNote>
      ) : (
        <ol className="relative ml-1.5 space-y-4 border-l border-border pl-5">
          {events.map((e, i) => (
            <li key={e.id} className="relative">
              <span
                className={`absolute top-1 -left-[25px] size-2.5 rounded-full ring-4 ring-surface ${i === 0 ? "bg-primary" : "bg-chart-4"}`}
                aria-hidden
              />
              <p className="flex items-center justify-between text-[12px] text-subtle tabular-nums">
                <span className="font-medium text-foreground">{e.when}</span>
                {e.extra && <span>{e.extra}</span>}
              </p>
              <p className="mt-0.5 truncate text-[13px] font-medium">{e.title}</p>
              {e.who && <p className="truncate text-[12px] text-subtle">{e.who}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
