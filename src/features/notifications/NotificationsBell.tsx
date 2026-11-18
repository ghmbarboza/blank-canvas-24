import { Bell, CheckCheck, Flame, UserPlus, CalendarClock, Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountId } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useMarkNotificationsRead, useNotifications, type Notification } from "./api";

const KIND_ICON: Record<string, typeof Bell> = {
  lead_hot: Flame,
  contact_assigned: UserPlus,
  meeting_soon: CalendarClock,
};

// Sino do menu lateral: avisos do usuário (cliente pedindo atenção, atribuição, lembretes), em tempo real.
export function NotificationsBell({ expanded }: { expanded: boolean }) {
  const accountId = useAccountId();
  const { data } = useNotifications(accountId);
  const markRead = useMarkNotificationsRead(accountId);
  const list = data ?? [];
  const unread = list.filter((n) => !n.read_at).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notificações, ${unread} não lidas` : "Notificações"}
          className={cn(
            "group relative flex h-10 shrink-0 items-center rounded-xl text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            expanded ? "w-full gap-3 px-3" : "w-10 justify-center",
          )}
        >
          <Bell className="size-[18px] shrink-0" strokeWidth={1.75} />
          {expanded && <span className="flex-1 text-left text-[13px]">Notificações</span>}
          {unread > 0 && (
            <span
              className={cn(
                "grid place-items-center rounded-full bg-primary font-semibold text-primary-foreground tabular-nums",
                expanded
                  ? "h-5 min-w-5 px-1.5 text-[10px]"
                  : "absolute top-1 right-1 h-4 min-w-4 px-1 text-[9px] ring-2 ring-background",
              )}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[13px] font-semibold">Notificações</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate("all")}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Marcar todas como lidas
            </button>
          )}
        </div>
        <ul className="max-h-[420px] overflow-y-auto py-1">
          {list.length === 0 && (
            <li className="px-4 py-8 text-center text-[12px] text-muted-foreground">
              Nada por aqui. Avisamos quando um cliente pedir atenção ou algo for atribuído a você.
            </li>
          )}
          {list.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onOpen={() => !n.read_at && markRead.mutate([n.id])}
            />
          ))}
        </ul>
        <a
          href="/ajustes?aba=notificacoes"
          className="block border-t border-border px-4 py-2.5 text-center text-[12px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          Escolher como receber avisos
        </a>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ n, onOpen }: { n: Notification; onOpen: () => void }) {
  const Icon = KIND_ICON[n.kind] ?? Info;
  const body = (
    <div
      className={cn(
        "flex gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2",
        !n.read_at && "bg-primary-soft/40",
      )}
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[13px]", !n.read_at && "font-semibold")}>{n.title}</p>
        {n.body && <p className="line-clamp-2 text-[12px] text-muted-foreground">{n.body}</p>}
        <p className="mt-0.5 text-[11px] text-subtle">{formatRelative(n.created_at)}</p>
      </div>
      {!n.read_at && (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="não lida" />
      )}
    </div>
  );
  return (
    <li>
      {n.link ? (
        <a href={n.link} onClick={onOpen} className="block">
          {body}
        </a>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full text-left">
          {body}
        </button>
      )}
    </li>
  );
}
