import { useMemo, useRef, type ReactNode } from "react";
import {
  useTable,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { useAccountId } from "@/lib/account";
import { cn } from "@/lib/utils";

import { useMomentMap } from "@/features/posvenda/moment-api";

import { useHealthMap } from "../customer-health";
import type { ContactRow, ContactSort, ContactSortColumn, TeamMember } from "../types";
import { buildContactColumns, contactTableFeatures } from "./contactColumns";
import { ContactsMobileList } from "./ContactsMobileList";

const VIRTUALIZE_FROM = 100;
const ROW_HEIGHT = 64;
const SORTABLE: ReadonlySet<string> = new Set<ContactSortColumn>([
  "name",
  "score",
  "owner_user_id",
  "last_interaction_at",
]);

function isSortColumn(id: string): id is ContactSortColumn {
  return SORTABLE.has(id);
}

function resolve<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(prev) : updater;
}

type Props = {
  rows: ContactRow[];
  members: TeamMember[];
  sort: ContactSort;
  onSortChange: (sort: ContactSort) => void;
  selection: RowSelectionState;
  onSelectionChange: (next: RowSelectionState) => void;
  channels: Map<string, string[]>;
  openId: string | null;
  onOpen: (id: string) => void;
  footer?: ReactNode;
};

export function ContactsTable({
  rows,
  members,
  sort,
  onSortChange,
  selection,
  onSelectionChange,
  channels,
  openId,
  onOpen,
  footer,
}: Props) {
  const accountId = useAccountId();
  const { map: health } = useHealthMap(accountId);
  const { map: moments } = useMomentMap(accountId);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const columns = useMemo(
    () => buildContactColumns(memberMap, channels, health, moments, onOpen),
    [memberMap, channels, health, moments, onOpen],
  );
  const sorting = useMemo<SortingState>(() => [{ id: sort.column, desc: sort.desc }], [sort]);

  const table = useTable({
    features: contactTableFeatures,
    columns,
    data: rows,
    getRowId: (row) => row.id,
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting, rowSelection: selection },
    onSortingChange: (updater) => {
      const first = resolve(updater, sorting)[0];
      if (first && isSortColumn(first.id)) onSortChange({ column: first.id, desc: first.desc });
    },
    onRowSelectionChange: (updater) => onSelectionChange(resolve(updater, selection)),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const virtual = tableRows.length > VIRTUALIZE_FROM;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (i) => tableRows[i]?.id ?? i,
    overscan: 10,
  });
  const items = virtual ? virtualizer.getVirtualItems() : [];
  const padTop = virtual ? (items[0]?.start ?? 0) : 0;
  const padBottom = virtual ? virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0) : 0;
  const visible = virtual
    ? items.map((v) => tableRows[v.index]).filter((r) => r !== undefined)
    : tableRows;
  const colCount = columns.length;

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <table className="hidden w-full border-separate border-spacing-0 text-left md:table">
        <thead className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const id = header.column.id;
                const sortable = isSortColumn(id);
                const dir = sort.column === id ? (sort.desc ? "descending" : "ascending") : "none";
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sortable ? dir : undefined}
                    className={cn(
                      "eyebrow border-b border-border px-3 py-3 whitespace-nowrap",
                      id === "select" && "w-10 pl-6",
                      id === "name" && "w-[32%]",
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 rounded uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <table.FlexRender header={header} />
                        {dir === "ascending" ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : dir === "descending" ? (
                          <ArrowDown className="size-3" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: padTop }} />
            </tr>
          )}
          {visible.map((row) => (
            <tr
              key={row.id}
              data-selected={row.original.id === openId || row.getIsSelected() ? "true" : undefined}
              className="group cursor-pointer transition-colors duration-200 hover:bg-[var(--wash)] data-[selected=true]:bg-[var(--wash-strong)]"
              style={{ height: ROW_HEIGHT }}
              onClick={(e) => {
                // Clique na linha abre a gaveta; caixa de seleção e botões cuidam de si.
                if ((e.target as HTMLElement).closest("button, a, [role=checkbox]")) return;
                onOpen(row.original.id);
              }}
            >
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    "border-b border-border px-3 py-2 align-middle",
                    cell.column.id === "select" &&
                      "pl-6 group-data-[selected=true]:shadow-[inset_2px_0_0_var(--primary)]",
                  )}
                >
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
          {padBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: padBottom }} />
            </tr>
          )}
        </tbody>
      </table>
      <ContactsMobileList
        health={health}
        moments={moments}
        rows={rows}
        selection={selection}
        onSelectionChange={onSelectionChange}
        channels={channels}
        onOpen={onOpen}
      />
      {footer}
    </div>
  );
}
