import {
  createColumnHelper,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

import { ContactAvatar } from "@/components/common/ContactAvatar";
import { TempChip } from "@/components/common/TempChip";
import { Checkbox } from "@/components/ui/checkbox";
import { formatRelative } from "@/lib/format";

import { isPlatformSource, type ContactRow, type TeamMember } from "../types";
import { AiScore, ChannelBadges } from "./ChannelBadges";
import { OwnerAvatar } from "./OwnerAvatar";

// Ordenação é feita no servidor (paginação por faixa), então só o recurso de estado é registrado.
export const contactTableFeatures = tableFeatures({ rowSortingFeature, rowSelectionFeature });

const helper = createColumnHelper<typeof contactTableFeatures, ContactRow>();

export function buildContactColumns(
  members: Map<string, TeamMember>,
  channels: Map<string, string[]>,
  onOpen: (id: string) => void,
) {
  return helper.columns([
    helper.display({
      id: "select",
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllRowsSelected()
              ? true
              : table.getIsSomeRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
          aria-label="Selecionar todos carregados"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onClick={row.getToggleSelectedHandler()}
          aria-label={`Selecionar ${row.original.name ?? "contato"}`}
        />
      ),
    }),
    helper.accessor("name", {
      id: "name",
      header: "Contato",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Abrir ${c.name ?? "contato"}`}
          >
            <ContactAvatar
              name={c.name}
              src={c.avatar_url}
              platform={isPlatformSource(c.source) ? c.source : null}
              size={36}
            />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-foreground">
                {c.name ?? "Sem nome"}
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {c.company ?? c.email ?? c.phone ?? "Sem empresa"}
              </span>
            </span>
          </button>
        );
      },
    }),
    helper.display({
      id: "channels",
      header: "Canais",
      cell: ({ row }) => (
        <ChannelBadges contact={row.original} platforms={channels.get(row.original.id)} />
      ),
    }),
    helper.display({
      id: "temperature",
      header: "Temperatura",
      cell: ({ row }) =>
        row.original.temperature ? (
          <TempChip level={row.original.temperature} />
        ) : (
          <span className="text-[12px] text-subtle">Sem leitura</span>
        ),
    }),
    helper.accessor("score", {
      id: "score",
      header: "Nota IA",
      cell: ({ row }) => (
        <AiScore score={row.original.score} temperature={row.original.temperature} />
      ),
    }),
    helper.accessor("owner_user_id", {
      id: "owner_user_id",
      header: "Resp.",
      cell: ({ getValue }) => {
        const id = getValue();
        return <OwnerAvatar member={id ? members.get(id) : undefined} size={24} />;
      },
    }),
    helper.accessor("last_interaction_at", {
      id: "last_interaction_at",
      header: "Último contato",
      cell: ({ getValue }) => (
        <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
          {formatRelative(getValue())}
        </span>
      ),
    }),
  ]);
}
