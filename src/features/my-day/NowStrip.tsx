import { Link } from "@tanstack/react-router";
import { ArrowRight, Inbox, ListOrdered } from "lucide-react";

import { useMyQueueCount, useUnreadValue } from "@/components/layout/nav-counts";

// Primeira coisa do dia de quem atende: tem gente esperando? Some quando não há nada.
export function NowStrip({ accountId, userId }: { accountId: string; userId: string | null }) {
  const queue = useMyQueueCount(accountId, userId ?? undefined);
  const unread = useUnreadValue(accountId);
  if (!queue && !unread) return null;
  const items = [
    queue
      ? {
          to: "/fila" as const,
          icon: ListOrdered,
          count: queue,
          label: queue === 1 ? "atendimento na sua fila" : "atendimentos na sua fila",
          cta: "Atender agora",
        }
      : null,
    unread
      ? {
          to: "/inbox" as const,
          icon: Inbox,
          count: unread,
          label: unread === 1 ? "mensagem sem resposta" : "mensagens sem resposta",
          cta: "Abrir a caixa",
        }
      : null,
  ].filter((x) => x !== null);

  return (
    <section
      aria-label="Para atender agora"
      className="mb-12 grid gap-3 rounded-2xl bg-primary p-2 text-primary-foreground sm:grid-cols-2 dark:border dark:border-border dark:bg-surface-2 dark:text-foreground"
    >
      {items.map(({ to, icon: Icon, count, label, cta }) => (
        <Link
          key={to}
          to={to}
          className="group flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-white/10 dark:hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 dark:bg-surface-3">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[26px] leading-none font-semibold tabular-nums">
              {count}
            </span>
            <span className="mt-1 block text-[13px] text-primary-foreground/75 dark:text-muted-foreground">
              {label}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium">
            {cta}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </Link>
      ))}
    </section>
  );
}
