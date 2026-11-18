import { Check, ChevronDown, UserRound, UserX } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import type { Member } from "../types";

interface Props {
  members: Member[];
  value: string | null;
  disabled: boolean;
  onChange: (userId: string | null, label: string) => void;
}

export function AssigneeSelect({ members, value, disabled, onChange }: Props) {
  const { user } = useAuth();
  const current = members.find((m) => m.userId === value);
  const label = !value
    ? "Sem responsável"
    : value === user?.id
      ? "Você"
      : (current?.name ?? "Membro");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Responsável: ${label}. Trocar`}
          className="inline-flex h-9 max-w-44 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] font-medium shadow-xs transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {value ? (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[9px] font-bold text-primary">
              {initials(current?.name ?? label)}
            </span>
          ) : (
            <UserRound className="size-4 text-subtle" aria-hidden />
          )}
          <span className="hidden truncate md:inline">{label}</span>
          <ChevronDown className="size-3.5 text-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[11px] tracking-widest text-subtle uppercase">
          Responsável
        </DropdownMenuLabel>
        {members.map((m) => (
          <DropdownMenuItem
            key={m.userId}
            onSelect={() => onChange(m.userId, m.userId === user?.id ? "você" : m.name)}
          >
            <span className="grid size-5 place-items-center rounded-full bg-primary-soft text-[9px] font-bold text-primary">
              {initials(m.name)}
            </span>
            <span className="flex-1 truncate">
              {m.name}
              {m.userId === user?.id && <span className="text-subtle"> (você)</span>}
            </span>
            {m.userId === value && <Check className="size-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onChange(null, "")} disabled={!value}>
          <UserX className="size-4" aria-hidden /> Tirar responsável
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
