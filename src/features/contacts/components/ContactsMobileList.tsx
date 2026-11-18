import type { RowSelectionState } from "@tanstack/react-table";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import { formatRelative } from "@/lib/format";

import { HealthChip, type CustomerHealth } from "../customer-health";
import { isPlatformSource, type ContactRow } from "../types";
import { ChannelBadges } from "./ChannelBadges";

type Props = {
  rows: ContactRow[];
  selection: RowSelectionState;
  onSelectionChange: (next: RowSelectionState) => void;
  channels: Map<string, string[]>;
  health: Map<string, CustomerHealth>;
  onOpen: (id: string) => void;
};

// Em tela pequena a tabela vira lista: nome, saúde e próximo passo, que é o que importa no celular.
export function ContactsMobileList({
  rows,
  selection,
  onSelectionChange,
  channels,
  health,
  onOpen,
}: Props) {
  function toggle(id: string, checked: boolean) {
    const next = { ...selection };
    if (checked) next[id] = true;
    else delete next[id];
    onSelectionChange(next);
  }

  return (
    <ul className="divide-y divide-border md:hidden">
      {rows.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-4 py-3">
          <Checkbox
            checked={selection[c.id] === true}
            onCheckedChange={(v) => toggle(c.id, v === true)}
            aria-label={`Selecionar ${c.name ?? "contato"}`}
            className="mt-2.5"
          />
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className="flex min-w-0 flex-1 gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ContactAvatar
              name={c.name}
              src={c.avatar_url}
              platform={isPlatformSource(c.source) ? c.source : null}
              size={40}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-medium">{c.name ?? "Sem nome"}</span>
                <span className="shrink-0 text-[11px] text-subtle tabular-nums">
                  {formatRelative(c.last_interaction_at)}
                </span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                {health.get(c.id) && (
                  <HealthChip
                    level={health.get(c.id)!.result.level}
                    score={health.get(c.id)!.result.score}
                  />
                )}
                <ChannelBadges contact={c} platforms={channels.get(c.id)} />
              </span>
              {c.company && (
                <span className="mt-0.5 block truncate text-[12px] text-subtle">{c.company}</span>
              )}
              {c.ai_next_step && (
                <span className="mt-1 line-clamp-1 text-[12px] text-muted-foreground">
                  {c.ai_next_step}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
