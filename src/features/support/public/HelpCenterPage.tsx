import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Search, ThumbsDown, ThumbsUp } from "lucide-react";

import { Input } from "@/components/ui/input";

import { Markdown } from "../MarkdownView";
import { PublicShell } from "./PublicShell";

interface ListItem {
  title: string;
  slug: string;
  category: string | null;
  excerpt: string;
}

// Central de ajuda pública da empresa: busca e artigos publicados, sem login.
export function HelpCenterPage({
  slug,
  article,
  onOpen,
}: {
  slug: string;
  article: string | null;
  onOpen: (a: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ["help", slug, term],
    enabled: !article,
    retry: false,
    queryFn: async () => {
      const res = await fetch(
        `/api/public/help?slug=${encodeURIComponent(slug)}${term ? `&q=${encodeURIComponent(term)}` : ""}`,
      );
      const j = (await res.json()) as { company?: string; articles?: ListItem[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Central não encontrada");
      return j;
    },
  });
  const one = useQuery({
    queryKey: ["help", slug, "article", article],
    enabled: Boolean(article),
    retry: false,
    queryFn: async () => {
      const res = await fetch(
        `/api/public/help?slug=${encodeURIComponent(slug)}&article=${encodeURIComponent(article!)}`,
      );
      const j = (await res.json()) as {
        company?: string;
        article?: { title: string; category: string | null; body_md: string; updated_at: string };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Artigo não encontrado");
      return j;
    },
  });
  const vote = useMutation({
    mutationFn: (helpful: boolean) =>
      fetch("/api/public/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, article, helpful }),
      }),
  });

  const company = list.data?.company ?? one.data?.company;
  const groups = [...new Set((list.data?.articles ?? []).map((a) => a.category || "Geral"))];

  return (
    <PublicShell company={company} wide>
      {article ? (
        <article className="rounded-[24px] border border-border bg-surface p-6 sm:p-8">
          <button
            type="button"
            onClick={() => onOpen(null)}
            className="mb-4 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Todos os artigos
          </button>
          {one.isPending ? (
            <Loader2 className="mx-auto my-10 animate-spin text-subtle" />
          ) : one.isError ? (
            <p className="text-[14px] text-muted-foreground">Artigo não encontrado.</p>
          ) : (
            <>
              {one.data?.article?.category && (
                <p className="eyebrow mb-1">{one.data.article.category}</p>
              )}
              <h1 className="font-display text-[26px] leading-tight font-medium">
                {one.data?.article?.title}
              </h1>
              <Markdown source={one.data?.article?.body_md ?? ""} className="mt-5" />
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-5 text-[13px]">
                {vote.isSuccess ? (
                  <span className="text-muted-foreground">Obrigado pelo retorno!</span>
                ) : (
                  <>
                    <span className="text-muted-foreground">Este artigo ajudou?</span>
                    <button
                      type="button"
                      onClick={() => vote.mutate(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 hover:bg-surface-2"
                    >
                      <ThumbsUp className="size-3.5" /> Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => vote.mutate(false)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 hover:bg-surface-2"
                    >
                      <ThumbsDown className="size-3.5" /> Não
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </article>
      ) : (
        <div className="space-y-6">
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <h1 className="font-display text-[24px] font-medium">Como podemos ajudar?</h1>
            <div className="relative mt-4">
              <Search
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Escreva sua dúvida"
                className="h-11 pl-9"
                aria-label="Buscar na central de ajuda"
              />
            </div>
          </div>
          {list.isPending ? (
            <Loader2 className="mx-auto my-10 animate-spin text-subtle" />
          ) : list.isError ? (
            <p className="text-center text-[14px] text-muted-foreground">
              Central de ajuda não encontrada.
            </p>
          ) : (list.data?.articles ?? []).length === 0 ? (
            <p className="text-center text-[14px] text-muted-foreground">
              {term
                ? "Nenhum artigo com essas palavras. Tente outras ou fale com a equipe."
                : "Ainda não há artigos publicados."}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g}>
                <p className="eyebrow mb-2">{g}</p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {(list.data?.articles ?? [])
                    .filter((a) => (a.category || "Geral") === g)
                    .map((a) => (
                      <li key={a.slug}>
                        <button
                          type="button"
                          onClick={() => onOpen(a.slug)}
                          className="lift h-full w-full rounded-[20px] border border-border bg-surface p-4 text-left"
                        >
                          <p className="text-[14px] font-semibold">{a.title}</p>
                          <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                            {a.excerpt.replace(/[#*`>[\]()]/g, "")}
                          </p>
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </PublicShell>
  );
}
