import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useCallStats } from "./api";
import { formatDuration, occupancyPercent } from "./lib";

interface Item {
  label: string;
  value: string;
  live?: boolean;
  alert?: boolean;
}

// Faixa "Agora": fila e números de hoje do call center (call_center_stats, a cada 15 s).
export function CallsLiveStrip({
  accountId,
  names,
}: {
  accountId: string;
  names: Map<string, string>;
}) {
  const stats = useCallStats(accountId);
  const s = stats.data;
  if (stats.isPending)
    return (
      <div className="px-4 py-4 sm:px-6">
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  if (!s) return null;
  const agentRows = s.agents ?? [];
  const teamTalk = agentRows.reduce((t, a) => t + a.talk_seconds, 0);
  const occupancy = occupancyPercent(
    teamTalk,
    s.window_seconds ?? 0,
    Math.max(s.agents_with_extension ?? 0, agentRows.length),
  );
  const abandon = s.today_inbound ? Math.round((100 * s.abandoned) / s.today_inbound) : 0;
  // Dia sem ligação nenhuma: em vez de oito zeros, diz o que vai aparecer aqui.
  if (!s.waiting && !s.in_progress && !s.today_inbound && !s.today_outbound && !s.today_ai)
    return (
      <section aria-label="Agora" className="px-4 pt-4 pb-3 sm:px-6">
        <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-[13px] text-muted-foreground">
          Nenhuma ligação hoje ainda. A fila ao vivo, a espera e o abandono aparecem aqui assim que
          a primeira ligação entrar ou sair.
        </p>
      </section>
    );
  const items: Item[] = [
    { label: "Na fila", value: String(s.waiting), live: s.waiting > 0 },
    { label: "Em ligação", value: String(s.in_progress), live: s.in_progress > 0 },
    { label: "Espera média", value: formatDuration(s.avg_wait_seconds) },
    { label: "Abandono hoje", value: `${abandon}%`, alert: abandon >= 10 },
    {
      label: `Atendidas em ${s.sla_seconds}s`,
      value: s.service_level === null ? "—" : `${s.service_level}%`,
    },
    { label: "Pela IA hoje", value: String(s.today_ai) },
    { label: "Ocupação", value: occupancy === null ? "—" : `${occupancy}%` },
    { label: "Conversa média", value: formatDuration(s.avg_talk_seconds) },
  ];
  return (
    <section aria-label="Agora" className="px-4 pt-4 pb-3 sm:px-6">
      <p className="eyebrow mb-2">
        Agora · hoje {s.today_inbound} recebidas, {s.today_outbound} feitas
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface px-4 py-3 sm:grid-cols-4 2xl:grid-cols-8">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={cn("min-w-0 flex-col-reverse", i < 4 ? "flex" : "hidden sm:flex")}
          >
            <dt className="truncate text-[11px] text-subtle">{it.label}</dt>
            <dd
              className={cn(
                "flex items-center gap-1.5 font-display text-[20px] leading-tight font-semibold tabular-nums",
                it.alert && "text-danger",
              )}
            >
              {it.live && (
                <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
              )}
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
      {agentRows.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Ocupação por atendente">
          {agentRows.map((a) => {
            const pct = occupancyPercent(a.talk_seconds, s.window_seconds ?? 0);
            return (
              <li
                key={a.user_id}
                className="rounded-full bg-surface-2 px-2.5 py-[3px] text-[11px] text-muted-foreground"
              >
                {names.get(a.user_id) ?? "Atendente"}: {pct === null ? "—" : `${pct}%`} · {a.calls}{" "}
                {a.calls === 1 ? "ligação" : "ligações"}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
