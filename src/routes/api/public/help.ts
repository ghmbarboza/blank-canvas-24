import { createFileRoute } from "@tanstack/react-router";

// Central de ajuda pública: lista/busca artigos publicados e abre um artigo pelo slug da conta.
export const Route = createFileRoute("/api/public/help")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/backend/http.server")).preflight(),
      GET: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const url = new URL(req.url);
          const slug = (url.searchParams.get("slug") ?? "").toLowerCase();
          if (!/^[a-z0-9-]{1,60}$/.test(slug))
            throw new h.HttpError(404, "Central não encontrada", "not_found");
          const db = h.admin();
          const { data: acc } = await db
            .from("accounts")
            .select("id, name")
            .eq("slug", slug)
            .maybeSingle();
          if (!acc) throw new h.HttpError(404, "Central não encontrada", "not_found");
          const article = url.searchParams.get("article");
          if (article) {
            const { data: a } = await db
              .from("kb_articles")
              .select("id, title, slug, category, body_md, updated_at, views")
              .eq("account_id", acc.id)
              .eq("slug", article)
              .eq("status", "published")
              .eq("visibility", "public")
              .maybeSingle();
            if (!a) throw new h.HttpError(404, "Artigo não encontrado", "not_found");
            // uma visualização por IP e artigo a cada hora: o contador não sobe em loop
            if (await h.allowOnce(`kb:view:${a.id}:${h.trustedIp(req)}`, 1, 3600))
              await db
                .from("kb_articles")
                .update({ views: a.views + 1 })
                .eq("id", a.id);
            return h.json({ company: acc.name, article: a });
          }
          const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
          if (q) {
            // R9: a busca pública gera embedding (IA) sem login. Cache por conta e pergunta, e limite por IP
            // e por conta só quando a resposta não está guardada.
            const { helpCacheGet, helpCacheSet, helpCacheKey } =
              await import("@/backend/support/help-cache");
            const key = helpCacheKey(acc.id, q);
            const cached = helpCacheGet(key);
            if (cached) return h.json({ company: acc.name, articles: cached });
            await h.rateLimit(`help:q:${h.trustedIp(req)}`, 30, 600);
            await h.rateLimit(`help:q:acc:${acc.id}`, 600, 3600);
            const { searchKb } = await import("@/backend/support/kb-search.server");
            const data = await searchKb(acc.id, q, { limit: 20, publicOnly: true });
            const articles = data.map((a) => ({
              title: a.title,
              slug: a.slug,
              category: a.category,
              excerpt: a.body_md.slice(0, 220),
            }));
            helpCacheSet(key, articles);
            return h.json({ company: acc.name, articles });
          }
          const { data } = await db
            .from("kb_articles")
            .select("title, slug, category, body_md")
            .eq("account_id", acc.id)
            .eq("status", "published")
            .eq("visibility", "public")
            .order("category")
            .order("title")
            .limit(300);
          return h.json({
            company: acc.name,
            articles: (data ?? []).map((a) => ({
              title: a.title,
              slug: a.slug,
              category: a.category,
              excerpt: a.body_md.slice(0, 220),
            })),
          });
        })(ctx);
      },
      POST: async (ctx) => {
        const h = await import("@/backend/http.server");
        return h.handle(async (req) => {
          const b = await h.readJson<{ slug?: string; article?: string; helpful?: boolean }>(
            req,
            2 * 1024,
          );
          const db = h.admin();
          const { data: acc } = await db
            .from("accounts")
            .select("id")
            .eq("slug", String(b.slug ?? ""))
            .maybeSingle();
          if (!acc) throw new h.HttpError(404, "Central não encontrada", "not_found");
          const { data: a } = await db
            .from("kb_articles")
            .select("id, helpful_yes, helpful_no")
            .eq("account_id", acc.id)
            .eq("slug", String(b.article ?? ""))
            .eq("visibility", "public")
            .maybeSingle();
          if (!a) throw new h.HttpError(404, "Artigo não encontrado", "not_found");
          // um voto por IP e artigo por dia; o repetido responde ok, mas não conta
          if (!(await h.allowOnce(`kb:vote:${a.id}:${h.trustedIp(req)}`, 1, 86_400)))
            return h.json({ ok: true, counted: false });
          await db
            .from("kb_articles")
            .update(
              b.helpful ? { helpful_yes: a.helpful_yes + 1 } : { helpful_no: a.helpful_no + 1 },
            )
            .eq("id", a.id);
          return h.json({ ok: true });
        })(ctx);
      },
    },
  },
});
