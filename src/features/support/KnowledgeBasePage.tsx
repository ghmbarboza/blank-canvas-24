import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Eye,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Plus,
  Search,
  Bot,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/account";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/functions";
import { cn } from "@/lib/utils";

import { useAccountSlug, useDeleteArticle, useKbArticles, useSaveArticle } from "./api";
import { KbSuggestions } from "./KbSuggestions";
import { Markdown } from "./MarkdownView";

type Article = NonNullable<ReturnType<typeof useKbArticles>["data"]>[number];

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Base de conhecimento: alimenta a central de ajuda pública, o agente de IA e o coach.
export function KnowledgeBasePage() {
  const { current, isManager } = useAccount();
  const accountId = current!.accountId;
  const articles = useKbArticles(accountId);
  const slug = useAccountSlug(accountId);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Article | "new" | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (articles.data ?? []).filter(
      (a) =>
        !t ||
        a.title.toLowerCase().includes(t) ||
        (a.category ?? "").toLowerCase().includes(t) ||
        a.body_md.toLowerCase().includes(t),
    );
  }, [articles.data, q]);
  const categories = [...new Set(list.map((a) => a.category || "Sem categoria"))].sort();
  const publicUrl = slug.data ? `/ajuda/${slug.data}` : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Base de conhecimento"
        description="Artigos que respondem clientes na central de ajuda e dão contexto ao agente de IA"
        actions={
          <>
            {publicUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <Globe /> <span className="hidden sm:inline">Central de ajuda</span>{" "}
                  <ExternalLink className="size-3" />
                </a>
              </Button>
            )}
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> Novo artigo
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <Link
          to="/atendimento"
          className="mb-4 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Atendimento
        </Link>
        <KbSuggestions
          accountId={accountId}
          articles={articles.data ?? []}
          canApprove={isManager}
          onReview={(a) => setEditing(a)}
        />
        <div className="relative mb-5 max-w-md">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar artigos"
            className="pl-9"
            aria-label="Buscar artigos"
          />
        </div>
        {articles.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-[24px]" />
            ))}
          </div>
        ) : (articles.data ?? []).length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Escreva o primeiro artigo"
            description="Comece pelas 5 perguntas que mais chegam: horário, formas de pagamento, prazos, segunda via, trocas. O agente de IA só responde o que está aqui."
            action={
              <Button onClick={() => setEditing("new")}>
                <Plus /> Novo artigo
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => (
              <section key={cat}>
                <p className="eyebrow mb-2">{cat}</p>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list
                    .filter((a) => (a.category || "Sem categoria") === cat)
                    .map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(a)}
                          className="lift flex h-full w-full flex-col rounded-[24px] border border-border bg-surface p-4 text-left"
                        >
                          <div className="flex items-start gap-2">
                            <p className="min-w-0 flex-1 text-[14px] font-semibold">{a.title}</p>
                            {a.visibility === "internal" ? (
                              <Lock
                                className="size-3.5 shrink-0 text-subtle"
                                aria-label="Interno"
                              />
                            ) : (
                              <Globe
                                className="size-3.5 shrink-0 text-subtle"
                                aria-label="Público"
                              />
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                            {a.body_md.replace(/[#*`>[\]()-]/g, "").slice(0, 180)}
                          </p>
                          <p className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-[11px] text-subtle">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5",
                                a.status === "published"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-surface-2",
                              )}
                            >
                              {a.status === "published" ? "Publicado" : "Rascunho"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Eye className="size-3" /> {a.views}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <ThumbsUp className="size-3" /> {a.helpful_yes}/
                              {a.helpful_yes + a.helpful_no}
                            </span>
                            {a.embedded_at && (
                              <span
                                className="inline-flex items-center gap-1"
                                title="Indexado para a busca semântica"
                              >
                                <Bot className="size-3" /> IA
                              </span>
                            )}
                            <span>· {formatRelative(a.updated_at)}</span>
                          </p>
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <ArticleSheet accountId={accountId} article={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ArticleSheet({
  accountId,
  article,
  onClose,
}: {
  accountId: string;
  article: Article | "new" | null;
  onClose: () => void;
}) {
  const save = useSaveArticle(accountId);
  const remove = useDeleteArticle(accountId);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [status, setStatus] = useState("draft");
  const existing = article && article !== "new" ? article : null;

  useEffect(() => {
    if (!article) return;
    setTitle(existing?.title ?? "");
    setCategory(existing?.category ?? "");
    setBody(existing?.body_md ?? "");
    setVisibility(existing?.visibility ?? "public");
    setStatus(existing?.status ?? "draft");
  }, [article, existing]);

  async function submit(publish?: boolean) {
    if (!title.trim()) {
      toast.error("Dê um título ao artigo");
      return;
    }
    try {
      await save.mutateAsync({
        ...(existing ? { id: existing.id } : {}),
        values: {
          title: title.trim(),
          slug: existing?.slug ?? `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`,
          category: category.trim() || null,
          body_md: body,
          visibility,
          status: publish === undefined ? status : publish ? "published" : "draft",
        },
      });
      toast.success(publish ? "Artigo publicado" : "Artigo salvo");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Sheet open={Boolean(article)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{existing ? "Editar artigo" : "Novo artigo"}</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          <div className="grid gap-1.5">
            <Label htmlFor="kb-title">Título (a pergunta do cliente)</Label>
            <Input
              id="kb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Como emitir a segunda via do boleto?"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="kb-cat">Categoria</Label>
              <Input
                id="kb-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Financeiro"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Quem vê</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger aria-label="Visibilidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Público (central e IA)</SelectItem>
                  <SelectItem value="internal">Interno (só equipe e IA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Situação</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger aria-label="Situação">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Tabs defaultValue="write">
            <TabsList>
              <TabsTrigger value="write">Escrever</TabsTrigger>
              <TabsTrigger value="preview">Pré-visualizar</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <Textarea
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-[13px]"
                placeholder={
                  "# Título\n\nTexto simples. Use **negrito**, listas com -, links [assim](https://...)."
                }
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-64 rounded-2xl border border-border p-4">
                {body.trim() ? (
                  <Markdown source={body} />
                ) : (
                  <p className="text-[12px] text-muted-foreground">Nada para mostrar ainda.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void submit(true)} disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />} Publicar
            </Button>
            <Button variant="outline" onClick={() => void submit()} disabled={save.isPending}>
              Salvar
            </Button>
            {existing && (
              <Button
                variant="ghost"
                className="ml-auto text-danger"
                onClick={() =>
                  remove.mutate(existing.id, {
                    onSuccess: () => {
                      toast.success("Artigo excluído");
                      onClose();
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <Trash2 /> Excluir
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
