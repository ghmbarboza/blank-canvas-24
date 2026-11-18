import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { TimelineEntry, type TimelineRow } from "@/features/contacts/components/detail/Timeline360";
import { TIMELINE_FILTERS } from "@/features/contacts/components/detail/timeline-filters";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface CompanyTimelineRow extends TimelineRow {
  contact_id: string;
  contact_name: string | null;
}

const PAGE = 40;

// Ficha 360 da empresa: a linha do tempo de todas as pessoas da empresa numa só (RPC company_timeline).
// O filtro por tipo vai para o banco, então "Carregar mais" continua certo com filtro ligado.
export function CompanyTimeline({ companyId }: { companyId: string }) {
  const [filter, setFilter] = useState("all");
  const active = TIMELINE_FILTERS.find((f) => f.id === filter)!;
  const q = useInfiniteQuery({
    queryKey: ["company-timeline", companyId, filter],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("company_timeline", {
        _company: companyId,
        _limit: PAGE,
        ...(pageParam ? { _before: pageParam } : {}),
        ...(active.kinds.length ? { _kinds: active.kinds } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as CompanyTimelineRow[];
    },
    getNextPageParam: (last) => (last.length < PAGE ? null : (last[last.length - 1]?.at ?? null)),
  });
  const rows = useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por tipo">
        {TIMELINE_FILTERS.filter((f) => f.id !== "privacy").map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors",
              filter === f.id
                ? "border-primary bg-primary-soft text-foreground"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Loader2 className="mx-auto my-10 animate-spin text-subtle" />
      ) : q.isError ? (
        <p className="py-6 text-center text-[12px] text-danger">
          Não deu para carregar a linha do tempo. Tente de novo em instantes.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title={filter === "all" ? "Nada por aqui ainda" : "Nada deste tipo"}
          description="Mensagens, propostas e tarefas de todas as pessoas da empresa aparecem nesta linha."
          className="py-10"
        />
      ) : (
        <ol>
          {rows.map((r) => (
            <TimelineEntry
              key={`${r.contact_id}-${r.kind}-${r.ref_id}`}
              r={r}
              who={r.contact_name ?? "Sem nome"}
            />
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
        >
          {q.isFetchingNextPage && <Loader2 className="animate-spin" />} Carregar mais
        </Button>
      )}
    </div>
  );
}
