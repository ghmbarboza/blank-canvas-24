import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Folder,
  Headphones,
  Library,
  Search,
  Star,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamMembers } from "@/features/contacts/api";
import { useDebounced } from "@/features/contacts/useDebounced";
import { highlightParts } from "@/features/training/roleplay";
import { useAccount } from "@/lib/account";
import { formatDateTime, formatListTime } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import {
  lastWeeks,
  mentionSeries,
  useConversationSearch,
  useDeleteHighlight,
  useHighlights,
  useSaveHighlight,
  useTermMentions,
  useTrackedTerms,
  type SearchFilters,
} from "./api";
import { TermsPanel } from "./TermsPanel";

type View = "momentos" | "busca" | "termos";

// Biblioteca de conversas: busca nas transcrições, melhores momentos e termos monitorados.
export function LibraryPage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const [view, setView] = useState<View>("momentos");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const highlights = useHighlights(accountId);
  const terms = useTrackedTerms(accountId);
  const mentions = useTermMentions(accountId, 84);
  const weeks = useMemo(() => lastWeeks(12), []);
  // Termos mais citados nas últimas 12 semanas; sem menção, a lista cadastrada.
  const topTerms = useMemo(() => {
    const ranked = mentionSeries(
      (mentions.data ?? []).map((m) => ({
        ...m,
        week: String(m.week),
        mentions: Number(m.mentions),
      })),
      weeks,
    ).map((s) => ({ term: s.term, total: s.total }));
    const seen = new Set(ranked.map((r) => r.term));
    const rest = (terms.data ?? [])
      .filter((t) => !seen.has(t.term))
      .map((t) => ({ term: t.term, total: 0 }));
    return [...ranked, ...rest].slice(0, 10);
  }, [mentions.data, terms.data, weeks]);

  function search(text: string) {
    setQ(text);
    setView(text.trim().length >= 2 ? "busca" : view === "busca" ? "momentos" : view);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Biblioteca"
        description="Tudo o que foi dito em reuniões e ligações, pesquisável, com os melhores momentos do time"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
          <section aria-labelledby="bib-intro" className="max-w-3xl">
            <h2
              id="bib-intro"
              className="font-display text-[30px] leading-[1.1] font-medium text-foreground sm:text-[40px]"
            >
              Aprenda com o que funcionou.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Busque o que o cliente disse em qualquer reunião ou ligação, guarde os melhores
              trechos e use no treino de quem chega no time.
            </p>
          </section>

          <div className="mt-10 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
            <aside className="space-y-8">
              <div className="relative">
                <Search
                  className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
                  aria-hidden
                />
                <Input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => search(e.target.value)}
                  placeholder="Buscar nas conversas"
                  className="pl-9"
                  aria-label="Buscar nas conversas"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => search("")}
                    aria-label="Limpar a busca"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-subtle hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <nav aria-label="Coleções">
                <p className="eyebrow mb-3">Coleções</p>
                <ul className="space-y-0.5">
                  <CollectionItem
                    label="Melhores momentos"
                    count={highlights.data?.length}
                    active={view === "momentos"}
                    onClick={() => setView("momentos")}
                  />
                  <CollectionItem
                    label="Termos monitorados"
                    count={terms.data?.length}
                    active={view === "termos"}
                    onClick={() => setView("termos")}
                  />
                  {q.trim().length >= 2 && (
                    <CollectionItem
                      label={`Busca: ${q.trim()}`}
                      active={view === "busca"}
                      onClick={() => setView("busca")}
                    />
                  )}
                </ul>
              </nav>

              {topTerms.length > 0 && (
                <section aria-labelledby="bib-tags">
                  <p id="bib-tags" className="eyebrow mb-3">
                    Termos mais citados
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {topTerms.map((t) => (
                      <li key={t.term}>
                        <button
                          type="button"
                          onClick={() => search(t.term)}
                          className="rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          aria-label={`Buscar ${t.term}${t.total ? `, ${t.total} menções` : ""}`}
                        >
                          {t.term}
                          {t.total > 0 && (
                            <span className="ml-1 text-subtle tabular-nums">{t.total}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>

            <div className="min-w-0">
              {view === "termos" ? (
                <>
                  <FeedHeader title="Termos monitorados" />
                  <div className="mt-6">
                    <TermsPanel accountId={accountId} isManager={isManager} />
                  </div>
                </>
              ) : view === "busca" && q.trim().length >= 2 ? (
                <SearchFeed accountId={accountId} q={q} />
              ) : (
                <HighlightsFeed
                  accountId={accountId}
                  isManager={isManager}
                  onSearch={() => searchRef.current?.focus()}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollectionItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active
            ? "bg-surface font-medium text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Folder className="size-4 shrink-0 text-subtle" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && (
          <span className="text-[11px] text-subtle tabular-nums">{count}</span>
        )}
      </button>
    </li>
  );
}

function FeedHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <h3 className="text-[14px] font-medium">{title}</h3>
      {children}
    </div>
  );
}

function Highlighted({ text, term }: { text: string; term: string }) {
  return (
    <>
      {highlightParts(text, term).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded bg-primary-soft px-0.5 font-medium text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function SourceLink({
  source,
  id,
  className,
  children,
}: {
  source: string;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return source === "meeting" ? (
    <Link to="/reunioes/$meetingId" params={{ meetingId: id }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/ligacoes" search={{ chamada: id }} className={className}>
      {children}
    </Link>
  );
}

// Item do acervo: coluna do tipo (reunião ou ligação) e o conteúdo com o trecho em destaque.
function FeedItem({
  source,
  sourceId,
  meta,
  title,
  byline,
  label,
  children,
  actions,
}: {
  source: string;
  sourceId: string;
  meta: string;
  title?: ReactNode;
  byline?: ReactNode;
  label: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = source === "meeting" ? Video : Headphones;
  return (
    <article className="group grid grid-cols-[40px_minmax(0,1fr)] gap-4 py-7 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-6">
      <SourceLink
        source={source}
        id={sourceId}
        className="grid size-10 place-items-center rounded-full border border-border bg-surface text-foreground transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-12"
      >
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">Abrir {source === "meeting" ? "a reunião" : "a ligação"}</span>
      </SourceLink>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
            {source === "meeting" ? "Reunião" : "Ligação"}
          </span>
          <span className="text-[12px] text-subtle">{meta}</span>
          {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
        </div>
        {title && (
          <h4 className="mt-2.5 font-display text-[19px] leading-snug font-semibold text-foreground">
            {title}
          </h4>
        )}
        {byline && <p className="mt-1 text-[13px] text-muted-foreground">{byline}</p>}
        <div className="mt-4 border-l-2 border-border-strong pl-4">
          <p className="eyebrow mb-1.5">{label}</p>
          {children}
        </div>
      </div>
    </article>
  );
}

function SearchFeed({ accountId, q }: { accountId: string; q: string }) {
  const team = useTeamMembers(accountId);
  const [source, setSource] = useState<SearchFilters["source"]>("all");
  const [days, setDays] = useState("90");
  const [userId, setUserId] = useState("all");
  const term = useDebounced(q, 300);
  const filters: SearchFilters = {
    q: term,
    source,
    days: days === "all" ? null : Number(days),
    userId: userId === "all" ? null : userId,
  };
  const results = useConversationSearch(accountId, filters);
  const save = useSaveHighlight(accountId);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const rows = results.data ?? [];

  return (
    <>
      <FeedHeader title={results.isSuccess ? `${rows.length} trecho(s) com “${term}”` : "Busca"}>
        <div className="flex flex-wrap gap-2">
          <Select value={source} onValueChange={(v) => setSource(v as SearchFilters["source"])}>
            <SelectTrigger className="h-8 w-40" aria-label="Tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Reuniões e ligações</SelectItem>
              <SelectItem value="meeting">Só reuniões</SelectItem>
              <SelectItem value="call">Só ligações</SelectItem>
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-28" aria-label="Período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="365">12 meses</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-8 w-40" aria-label="Vendedor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo o time</SelectItem>
              {(team.data ?? []).map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FeedHeader>

      {results.isPending ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : results.isError ? (
        <EmptyState
          icon={Search}
          title="Não deu para buscar"
          description={errorMessage(results.error)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhum documento com essa busca"
          description={`Nenhuma transcrição com “${term}” no período e nos filtros escolhidos. Amplie o período ou tente outra palavra.`}
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={`${r.source_id}-${i}`}>
              <FeedItem
                source={r.source}
                sourceId={r.source_id}
                meta={formatListTime(r.at)}
                title={
                  <SourceLink
                    source={r.source}
                    id={r.source_id}
                    className="hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {r.title}
                  </SourceLink>
                }
                byline={
                  [
                    r.user_id ? `Com ${names.get(r.user_id) ?? "vendedor"}` : null,
                    r.contact_name ? `cliente ${r.contact_name}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                label={r.speaker ? `Trecho · ${r.speaker}` : "Trecho"}
                actions={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[12px]"
                    onClick={() =>
                      save.mutate(
                        {
                          source: r.source as "meeting" | "call",
                          source_id: r.source_id,
                          excerpt: r.excerpt ?? "",
                        },
                        {
                          onSuccess: () => toast.success("Salvo nos melhores momentos"),
                          onError: (e) => toast.error(errorMessage(e)),
                        },
                      )
                    }
                    disabled={save.isPending}
                  >
                    <Star /> Guardar trecho
                  </Button>
                }
              >
                <p
                  className="text-[14px] leading-relaxed text-foreground"
                  title={formatDateTime(r.at)}
                >
                  <Highlighted text={r.excerpt ?? ""} term={term} />
                </p>
              </FeedItem>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function HighlightsFeed({
  accountId,
  isManager,
  onSearch,
}: {
  accountId: string;
  isManager: boolean;
  onSearch: () => void;
}) {
  const list = useHighlights(accountId);
  const team = useTeamMembers(accountId);
  const remove = useDeleteHighlight(accountId);
  const names = useMemo(
    () => new Map((team.data ?? []).map((m) => [m.userId, m.name])),
    [team.data],
  );
  const rows = list.data ?? [];
  return (
    <>
      <FeedHeader title="Melhores momentos">
        {rows.length > 0 && (
          <span className="text-[12px] text-subtle">Do mais recente para o mais antigo</span>
        )}
      </FeedHeader>
      {list.isPending ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState
          icon={Star}
          title="Não deu para carregar"
          description={errorMessage(list.error)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nenhum melhor momento ainda"
          description="Busque uma palavra (preço, concorrente, prazo) e guarde os trechos exemplares. Eles viram material de treino do time."
          action={
            <Button onClick={onSearch}>
              <Search /> Buscar nas conversas
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((h) => (
            <li key={h.id}>
              <FeedItem
                source={h.source}
                sourceId={h.source_id}
                meta={formatListTime(h.created_at)}
                byline={`Guardado por ${h.created_by ? (names.get(h.created_by) ?? "alguém do time") : "alguém do time"}`}
                label="Trecho"
                actions={
                  <>
                    <SourceLink
                      source={h.source}
                      id={h.source_id}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Abrir <ArrowUpRight className="size-3" aria-hidden />
                    </SourceLink>
                    {isManager && (
                      <button
                        type="button"
                        aria-label="Remover dos melhores momentos"
                        onClick={() =>
                          remove.mutate(h.id, {
                            onSuccess: () => toast.success("Removido"),
                            onError: (e) => toast.error(errorMessage(e)),
                          })
                        }
                        className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </>
                }
              >
                <p className="text-[15px] leading-relaxed text-foreground">“{h.excerpt}”</p>
                {h.note && <p className="mt-2 text-[13px] text-muted-foreground">{h.note}</p>}
              </FeedItem>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
