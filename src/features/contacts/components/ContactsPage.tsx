import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { RowSelectionState } from "@tanstack/react-table";
import { Download, Loader2, Plus, SearchX, Upload, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MOMENT_LABEL,
  MOMENT_PRIORITY,
  isMomentKey,
  momentCounts,
} from "@/features/posvenda/moment";
import { useMomentMap } from "@/features/posvenda/moment-api";
import { useAccountId } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/functions";
import { formatNumber } from "@/lib/format";

import {
  MOMENT_FILTER_MAX,
  fetchAllFilteredContacts,
  useContactChannels,
  useContactSources,
  useContactsList,
  useTeamMembers,
} from "../api";
import { contactsToCsv, downloadText } from "../csv";
import {
  DEFAULT_CONTACT_FILTERS,
  DEFAULT_CONTACT_SORT,
  type ContactFilters,
  type ContactSort,
} from "../types";
import { useDebounced } from "../useDebounced";
import { ContactFormDialog } from "./ContactFormDialog";
import { ContactsBulkBar } from "./ContactsBulkBar";
import { ContactsFilters } from "./ContactsFilters";
import type { SegmentFilter, SegmentRule } from "@/features/segments/rules";
import { ContactDrawer } from "./ContactDrawer";
import { ContactsTable } from "./ContactsTable";
import { SegmentPills } from "./SegmentPills";
import { ImportCsvDialog } from "./ImportCsvDialog";

export function ContactsPage() {
  const accountId = useAccountId();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();

  // o Painel abre a lista já num momento: /contatos?momento=arrependimento
  const initialMoment = (useSearch({ strict: false }) as { momento?: unknown }).momento;
  const [baseFilters, setBaseFilters] = useState<ContactFilters>(() => ({
    ...DEFAULT_CONTACT_FILTERS,
    moment: isMomentKey(initialMoment) ? initialMoment : "all",
  }));
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const filters = useMemo(
    () => ({ ...baseFilters, search: debouncedSearch }),
    [baseFilters, debouncedSearch],
  );
  const [sort, setSort] = useState<ContactSort>(DEFAULT_CONTACT_SORT);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openContact = useCallback((id: string) => setOpenId(id), []);

  const moments = useMomentMap(accountId);
  const counts = useMemo(() => momentCounts(moments.map.values()), [moments.map]);
  // quem está no momento escolhido, do mais urgente (selo principal) para o menos
  const momentIds = useMemo(() => {
    if (filters.moment === "all") return null;
    const key = filters.moment;
    return [...moments.map.entries()]
      .filter(([, m]) => m.keys.includes(key))
      .sort(
        ([, a], [, b]) =>
          MOMENT_PRIORITY.indexOf(a.primary.key) - MOMENT_PRIORITY.indexOf(b.primary.key),
      )
      .map(([id]) => id);
  }, [filters.moment, moments.map]);
  const momentOverflow = (momentIds?.length ?? 0) > MOMENT_FILTER_MAX;
  const listIds = filters.moment !== "all" && moments.isPending ? [] : momentIds;

  const list = useContactsList(accountId, filters, sort, userId, listIds);
  const team = useTeamMembers(accountId);
  const sources = useContactSources(accountId);

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const channelsQuery = useContactChannels(accountId, rowIds);
  const channels = useMemo(
    () => channelsQuery.data ?? new Map<string, string[]>(),
    [channelsQuery.data],
  );
  const openRow = openId ? rows.find((r) => r.id === openId) : undefined;
  const ownerOf = (id: string | null | undefined) =>
    id ? (team.data ?? []).find((m) => m.userId === id) : undefined;
  const selectedIds = useMemo(
    () => Object.keys(selection).filter((id) => selection[id]),
    [selection],
  );
  const hasFilters =
    Boolean(filters.search) ||
    filters.temperature !== "all" ||
    filters.lifecycle !== "all" ||
    filters.source !== "all" ||
    filters.onlyMine ||
    filters.moment !== "all" ||
    Boolean(filters.segment);

  function changeFilters(next: ContactFilters) {
    setBaseFilters(next);
    setSelection({});
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAllFilteredContacts(accountId, filters, sort, userId, listIds);
      downloadText(`contatos-${new Date().toISOString().slice(0, 10)}.csv`, contactsToCsv(all));
      toast.success(`${formatNumber(all.length)} contatos exportados`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const footer = list.hasNextPage ? (
    <div className="flex items-center justify-center gap-3 py-4">
      <span className="text-[12px] text-subtle tabular-nums">
        {formatNumber(rows.length)} de {formatNumber(total)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void list.fetchNextPage()}
        disabled={list.isFetchingNextPage}
      >
        {list.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
        Carregar mais
      </Button>
    </div>
  ) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Clientes"
        description={
          list.isSuccess
            ? `${formatNumber(total)} ${hasFilters ? "no filtro" : "na base"} · a saúde de cada cliente aparece com o motivo`
            : "Carregando…"
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportCsv()}
              disabled={exporting || !total}
              aria-label="Exportar contatos"
            >
              {exporting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImporting(true)}
              aria-label="Importar planilha"
            >
              <Upload aria-hidden />
              <span className="hidden sm:inline">Importar</span>
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              <span className="hidden sm:inline">Novo contato</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </>
        }
      />
      <ContactsFilters
        filters={baseFilters}
        onChange={changeFilters}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setSelection({});
        }}
        sources={sources.data ?? []}
        momentCounts={moments.isPending ? undefined : counts}
        segments={
          <SegmentPills
            accountId={accountId}
            activeId={baseFilters.segmentId}
            currentAsRules={quickFiltersAsRules(baseFilters, userId)}
            onApply={(seg) =>
              changeFilters({
                ...baseFilters,
                segment: seg?.filter ?? null,
                segmentId: seg?.id ?? null,
              })
            }
          />
        }
      />
      {filters.moment !== "all" && (
        <p
          role="status"
          className="border-b border-border bg-surface-2 px-4 py-2 text-[12px] text-muted-foreground md:px-6"
        >
          <span className="font-medium text-foreground">{MOMENT_LABEL[filters.moment]}:</span>{" "}
          {moments.isPending
            ? "calculando o momento de cada cliente…"
            : momentOverflow
              ? `mostrando os ${MOMENT_FILTER_MAX} mais urgentes de ${formatNumber(momentIds?.length ?? 0)} clientes neste momento.`
              : "contado pela data da compra de cada cliente e pelos prazos em Regras de pós-venda."}
        </p>
      )}
      {selectedIds.length > 0 && (
        <ContactsBulkBar
          accountId={accountId}
          selectedIds={selectedIds}
          members={team.data ?? []}
          onClear={() => setSelection({})}
        />
      )}

      {list.isPending ? (
        <div className="space-y-2 p-6" aria-busy aria-label="Carregando contatos">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          icon={SearchX}
          title="Não deu para carregar os contatos"
          description={errorMessage(list.error)}
          action={<Button onClick={() => void list.refetch()}>Tentar de novo</Button>}
        />
      ) : rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={SearchX}
            title="Nenhum contato neste filtro"
            description="Tente outra busca ou limpe os filtros para ver a base inteira."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  changeFilters(DEFAULT_CONTACT_FILTERS);
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Sua base de contatos começa aqui"
            description="Cada pessoa que mandar mensagem por um canal conectado vira contato sozinha, já classificada pela IA. Você também pode cadastrar ou importar uma planilha."
            action={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <Upload aria-hidden /> Importar CSV
                </Button>
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden /> Novo contato
                </Button>
              </div>
            }
          />
        )
      ) : (
        <ContactsTable
          rows={rows}
          members={team.data ?? []}
          sort={sort}
          onSortChange={setSort}
          selection={selection}
          onSelectionChange={setSelection}
          channels={channels}
          openId={openId}
          onOpen={openContact}
          footer={footer}
        />
      )}

      <ContactDrawer
        accountId={accountId}
        contact={openRow}
        platforms={openRow ? channels.get(openRow.id) : undefined}
        owner={ownerOf(openRow?.owner_user_id)}
        onClose={() => setOpenId(null)}
      />
      <ContactFormDialog
        accountId={accountId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => void navigate({ to: "/contatos/$contactId", params: { contactId: id } })}
      />
      <ImportCsvDialog accountId={accountId} open={importing} onOpenChange={setImporting} />
    </div>
  );
}

// Os filtros rápidos da tela viram regras, para "salvar o filtro atual como segmento".
function quickFiltersAsRules(f: ContactFilters, userId: string | null): SegmentFilter {
  const rules: SegmentRule[] = [];
  if (f.temperature === "none") rules.push({ field: "temperature", op: "is_empty" });
  else if (f.temperature !== "all")
    rules.push({ field: "temperature", op: "eq", value: f.temperature });
  if (f.lifecycle !== "all") rules.push({ field: "lifecycle", op: "eq", value: f.lifecycle });
  if (f.source !== "all") rules.push({ field: "source", op: "eq", value: f.source });
  if (f.onlyMine && userId) rules.push({ field: "owner", op: "eq", value: userId });
  return { match: "all", rules };
}
