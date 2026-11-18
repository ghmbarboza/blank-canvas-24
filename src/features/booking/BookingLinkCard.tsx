import { hasChannel } from "@/lib/edition";
import {
  CalendarOff,
  Copy,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OwnerAvatar } from "@/features/contacts/components/OwnerAvatar";
import type { TeamMember } from "@/features/contacts/types";
import { cn } from "@/lib/utils";

import type { BookingPage, BookingStats } from "./api";
import { memberIds } from "./members";

type Props = {
  page: BookingPage;
  url: string;
  stats: BookingStats | undefined;
  members: Map<string, TeamMember>;
  /** Pessoas que atendem pelo link e ainda não ligaram a agenda externa (só para gestor). */
  missingCalendar: string[];
  isSelected: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

// Cartão de um link: situação, duração, endereço com copiar, quem atende e quantas reuniões trouxe.
export function BookingLinkCard({
  page,
  url,
  stats,
  members,
  missingCalendar,
  isSelected,
  onSelect,
  onCopy,
  onEdit,
  onDelete,
}: Props) {
  const ids = memberIds(page);
  const owner = page.owner_user_id ? members.get(page.owner_user_id) : undefined;
  const display = url.replace(/^https?:\/\//, "");

  return (
    <article
      data-selected={isSelected ? "true" : undefined}
      className={cn(
        "rounded-xl border border-border bg-surface p-5 transition-shadow duration-200",
        "data-[selected=true]:border-primary/40 data-[selected=true]:shadow-lift",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {page.is_active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                Recebendo agendamentos
              </span>
            ) : (
              <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                Pausado
              </span>
            )}
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
              {page.duration_min} min
            </span>
          </div>
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={isSelected}
            className="mt-2 block max-w-full truncate rounded text-left font-display text-[17px] font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {page.title}
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Mais ações de ${page.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Abrir a página
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger">
              <Trash2 /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3",
            !page.is_active && "opacity-60",
          )}
        >
          <Link2 className="size-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="truncate font-mono text-[12px] text-muted-foreground">{display}</span>
        </div>
        <Button variant="outline" size="icon" onClick={onCopy} aria-label="Copiar link">
          <Copy />
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <dt className="text-[11px] text-subtle">Quem atende</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-medium">
            {page.mode === "round_robin" ? (
              <>
                <Repeat className="size-3.5 shrink-0 text-subtle" aria-hidden />
                <span className="truncate">Rodízio de {ids.length}</span>
              </>
            ) : (
              <>
                <OwnerAvatar member={owner} size={18} />
                <span className="truncate">{owner ? owner.name.split(" ")[0] : "Sem dono"}</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-subtle">Últimos 7 dias</dt>
          <dd className="mt-0.5 text-[13px] font-medium tabular-nums">
            {stats ? `${stats.week} marcada${stats.week === 1 ? "" : "s"}` : "—"}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-[11px] text-subtle">Próximas</dt>
          <dd className="mt-0.5 font-display text-[15px] font-semibold tabular-nums">
            {stats ? stats.upcoming : "—"}
          </dd>
        </div>
      </dl>

      {hasChannel("video") && missingCalendar.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">
          <CalendarOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {missingCalendar.join(" e ")} ainda não{" "}
            {missingCalendar.length > 1 || /^\d+ pessoas/.test(missingCalendar[0] ?? "")
              ? "ligaram"
              : "ligou"}{" "}
            a agenda do Google ou Outlook. O que estiver marcado lá pode aparecer como livre.
          </span>
        </p>
      )}
    </article>
  );
}
